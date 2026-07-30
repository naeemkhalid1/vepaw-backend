import { BadRequestException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { randomInt } from 'crypto';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { ServiceResponse, ProductResponse, OrderResponse, SubscriptionResponse } from '../../shared/types';
import { toProductResponse, toOrderResponse, toSubscriptionResponse } from '../../shared/mappers/store.mapper';
import { ListProductsDto } from './dto/list-products.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateSubscriptionDto } from '../subscriptions/dto/create-subscription.dto';
import { UpdateSubscriptionDto } from '../subscriptions/dto/update-subscription.dto';
import { SafepayService } from '../../common/payments/safepay.service';
import {
  SafepayWebhookEvent,
  extractOrderId,
  extractAmount,
} from '../../common/payments/safepay-webhook-event.interface';
import { NotificationsService } from '../notifications/notifications.service';

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);

const INTERVAL_DAYS: Record<'weekly' | 'biweekly' | 'monthly' | 'quarterly', number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

// Confirmed 2026-07-21: percentage-based (10%, same launch-phase rate as appointments and
// consultations) — replaces the previous hardcoded 0% (stores kept 100% of order value).
// Separate from Safepay's own processing fee, taken on their side during settlement.
const STORE_COMMISSION_RATE = 0.1;

// Same window used for appointment reservations / consultation pending-payment sessions — how
// long a safepay order can sit unpaid (owner opened checkout, never completed or failed it)
// before we give up and cancel it, so it doesn't sit in the order list forever.
const ORDER_PENDING_PAYMENT_TIMEOUT_MINUTES = 15;

// How long a *paid* order can sit unconfirmed by the store before we give up on the store ever
// acting, auto-cancel it, and refund the customer — established-marketplace safety net (mirrors
// Foodpanda/Daraz-style confirmation SLAs) that this platform otherwise lacked entirely: without
// this, a paid order the store ignores just sits in limbo forever with no resolution. Chosen as
// 6 hours to survive a single store-owner off-hours/overnight gap while still resolving same-day
// for orders placed in the morning.
const ORDER_CONFIRMATION_TIMEOUT_HOURS = 6;

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly safepayService: SafepayService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async listProducts(dto: ListProductsDto): Promise<ServiceResponse<ProductResponse[]>> {
    const filter: Record<string, unknown> = { productStatus: 'active', inStock: true };

    if (dto.category) filter['category'] = dto.category;
    if (dto.petType) filter['petTypes'] = dto.petType;
    if (dto.storeId) filter['store'] = new Types.ObjectId(dto.storeId);
    if (dto.isVetRecommended === true) filter['isVetRecommended'] = true;
    if (dto.q) filter['$text'] = { $search: dto.q };
    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (dto.minPrice !== undefined) priceFilter['$gte'] = dto.minPrice;
      if (dto.maxPrice !== undefined) priceFilter['$lte'] = dto.maxPrice;
      filter['price'] = priceFilter;
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest:     { _id: -1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      popular:    { sold: -1 },
    };
    // 'relevance' is the implicit default while searching (q set, no explicit sort chosen) —
    // previously a search ignored match quality entirely and just returned newest-first, so
    // typing a query never surfaced the best match. An explicit sort still wins over relevance,
    // same as it wins over the newest default, since that's a deliberate user choice.
    const sort = dto.sort ?? (dto.q ? 'relevance' : 'newest');

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    let query = this.productModel.find(filter);
    if (sort === 'relevance' && dto.q) {
      query = query
        .select({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } });
    } else {
      query = query.sort(sortMap[sort] ?? sortMap.newest);
    }

    const [products, total] = await Promise.all([
      query.skip(skip).limit(limit).lean(),
      this.productModel.countDocuments(filter),
    ]);

    return {
      data: products.map((p) => toProductResponse(p as Parameters<typeof toProductResponse>[0])),
      message: 'Products retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProduct(productId: string): Promise<ServiceResponse<ProductResponse>> {
    const product = await this.productModel.findById(productId).lean();
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });

    return {
      data: toProductResponse(product as Parameters<typeof toProductResponse>[0]),
      message: 'Product retrieved',
    };
  }

  async placeOrder(userId: string, dto: PlaceOrderDto): Promise<ServiceResponse<OrderResponse>> {
    const productIds = dto.items.map((i) => i.product);
    const products = await this.productModel.find({ _id: { $in: productIds } }).lean();

    if (products.length !== productIds.length) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'One or more products not found' });
    }

    const storeIds = [...new Set(products.map((p) => p.store.toString()))];
    if (storeIds.length > 1) {
      throw new BadRequestException({ code: 'MULTI_STORE_ORDER', message: 'All items must be from the same store' });
    }

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let serverTotal = 0;
    const orderItems = dto.items.map((item) => {
      const product = productMap.get(item.product)!;
      if (!product.inStock) {
        throw new UnprocessableEntityException({ code: 'OUT_OF_STOCK', message: `${product.name} is out of stock` });
      }

      let unitPrice = product.price;
      if (item.variantId && product.variants?.length) {
        const variant = product.variants.find((v) => (v as unknown as Record<string, unknown>)._id?.toString() === item.variantId);
        if (variant) unitPrice = variant.price;
      }

      const lineTotal = unitPrice * item.qty;
      serverTotal += lineTotal;
      return {
        product: product._id,
        name: product.name,
        photo: product.photo ?? '',
        variantId: item.variantId ?? null,
        qty: item.qty,
        price: unitPrice,
      };
    });

    if (Math.abs(serverTotal - dto.totalAmount) > 0.01) {
      throw new UnprocessableEntityException({ code: 'TOTAL_MISMATCH', message: 'Order total does not match server-computed total' });
    }

    const store = products[0].store;
    const storeName = products[0].storeName;
    const humanOrderId = `PC-${randomInt(100000, 999999)}`;

    const platformCommission = Math.round(serverTotal * STORE_COMMISSION_RATE);
    const storePayout = serverTotal - platformCommission;

    // Reserved atomically per item (with rollback on partial failure) immediately before the
    // order is created, not just gated by the stale inStock boolean checked above — closes the
    // race where two concurrent orders could both pass the earlier check against the same unit.
    await this.reserveStock(orderItems);

    const order = await this.orderModel.create({
      orderId: humanOrderId,
      user: userId,
      store,
      storeName,
      items: orderItems,
      totalAmount: serverTotal,
      platformCommission,
      storePayout,
      paymentMethod: dto.paymentMethod,
      deliveryAddress: dto.deliveryAddress,
    });

    let checkoutUrl: string | null = null;
    if (dto.paymentMethod === 'safepay') {
      const orderObjectId = order._id.toString();
      const frontendBaseUrl = this.config.getOrThrow<string>('FRONTEND_BASE_URL');
      const session = await this.safepayService.createCheckoutSession(
        serverTotal,
        orderObjectId,
        `${frontendBaseUrl}/callback?type=order&id=${orderObjectId}&result=success`,
        `${frontendBaseUrl}/callback?type=order&id=${orderObjectId}&result=cancelled`,
      );
      order.paymentReference = session.trackerToken;
      await order.save();
      checkoutUrl = session.checkoutUrl;
    }

    return {
      data: toOrderResponse(order.toObject() as Parameters<typeof toOrderResponse>[0], checkoutUrl),
      message: 'Order placed successfully',
    };
  }

  async listOrders(userId: string, dto: ListOrdersDto): Promise<ServiceResponse<OrderResponse[]>> {
    const filter: Record<string, unknown> = { user: userId };
    if (dto.status) filter['status'] = dto.status;

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      data: orders.map((o) => toOrderResponse(o as Parameters<typeof toOrderResponse>[0])),
      message: 'Orders retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOrder(userId: string, orderId: string): Promise<ServiceResponse<OrderResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId }).lean();
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    return {
      data: toOrderResponse(order as Parameters<typeof toOrderResponse>[0]),
      message: 'Order retrieved',
    };
  }

  // Owner-scoped and cancel-only, deliberately — this used to be an unrestricted "set any
  // status" endpoint reachable by any authenticated principal on any order (not just its
  // owner), including fulfillment transitions like 'delivered' that should only ever be a
  // store action. Fulfillment now lives exclusively in StorePortalService.updateOrderStatus(),
  // which is already scoped to `store: storeId`.
  async cancelOrder(
    userId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<ServiceResponse<OrderResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    if (TERMINAL_STATUSES.has(order.status)) {
      throw new UnprocessableEntityException({ code: 'ORDER_TERMINAL', message: 'Order is already in a terminal state' });
    }

    // Refund before committing the cancellation — same pattern as appointment cancellation —
    // if Safepay fails, the order stays in its current status so the owner can retry, instead
    // of ending up 'cancelled' with 'paid' still on it while no money actually moved back.
    if (order.paymentMethod === 'safepay' && order.paymentStatus === 'paid') {
      if (!order.paymentReference) {
        this.logger.error(`Cancel: paid safepay order ${orderId} has no paymentReference, cannot refund`);
        throw new UnprocessableEntityException({
          code: 'REFUND_FAILED',
          message: 'Unable to process the refund right now — please try again shortly',
        });
      }
      try {
        await this.safepayService.refundPayment(order.paymentReference, order.totalAmount);
      } catch (err) {
        this.logger.error(
          `Refund failed for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new UnprocessableEntityException({
          code: 'REFUND_FAILED',
          message: 'Unable to process the refund right now — please try again shortly',
        });
      }
      order.paymentStatus = 'refunded';
    }

    order.status = dto.status;
    await order.save();
    await this.restoreStock(order.items);

    return {
      data: toOrderResponse(order.toObject() as Parameters<typeof toOrderResponse>[0]),
      message: 'Order cancelled',
    };
  }

  async createSubscription(userId: string, dto: CreateSubscriptionDto): Promise<ServiceResponse<SubscriptionResponse>> {
    const product = await this.productModel.findById(dto.productId).lean();
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    if (!product.inStock) {
      throw new UnprocessableEntityException({ code: 'OUT_OF_STOCK', message: `${product.name} is out of stock` });
    }

    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const defaultAddress = user.addresses.find((a) => a.isDefault) ?? user.addresses[0];
    if (!defaultAddress) {
      throw new BadRequestException({ code: 'ADDRESS_REQUIRED', message: 'Add a delivery address before creating a subscription' });
    }

    const qty = 1;
    const unitPrice = product.price;
    const orderId = `PC-${randomInt(100000, 999999)}`;
    const totalAmount = unitPrice * qty;
    const platformCommission = Math.round(totalAmount * STORE_COMMISSION_RATE);
    const storePayout = totalAmount - platformCommission;

    // Note: no recurring billing engine exists yet — this only creates the first cycle's Order
    // record with status 'active'; nothing here calls Safepay to actually charge on an ongoing
    // basis. paymentMethod is stored for when that engine exists, but has no effect today.
    const order = await this.orderModel.create({
      orderId,
      user: userId,
      store: product.store,
      storeName: product.storeName,
      items: [{
        product: product._id,
        name: product.name,
        photo: product.photo ?? '',
        variantId: null,
        qty,
        price: unitPrice,
      }],
      totalAmount,
      platformCommission,
      storePayout,
      status: 'active',
      paymentMethod: dto.paymentMethod,
      deliveryAddress: {
        street: defaultAddress.street,
        area: defaultAddress.area,
        city: defaultAddress.city,
        label: defaultAddress.label,
      },
      isSubscription: true,
      interval: dto.interval,
      nextOrderDate: this.computeNextOrderDate(dto.interval),
    });

    return {
      data: toSubscriptionResponse(order.toObject() as Parameters<typeof toSubscriptionResponse>[0]),
      message: 'Subscription created',
    };
  }

  async listSubscriptions(userId: string, page: number, limit: number): Promise<ServiceResponse<SubscriptionResponse[]>> {
    const filter = { user: userId, isSubscription: true };
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      data: orders.map((o) => toSubscriptionResponse(o as Parameters<typeof toSubscriptionResponse>[0])),
      message: 'Subscriptions retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSubscription(userId: string, orderId: string): Promise<ServiceResponse<SubscriptionResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId, isSubscription: true }).lean();
    if (!order) throw new NotFoundException({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' });

    return {
      data: toSubscriptionResponse(order as Parameters<typeof toSubscriptionResponse>[0]),
      message: 'Subscription retrieved',
    };
  }

  async updateSubscription(userId: string, orderId: string, dto: UpdateSubscriptionDto): Promise<ServiceResponse<SubscriptionResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId, isSubscription: true });
    if (!order) throw new NotFoundException({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' });

    if (order.status === 'cancelled') {
      throw new UnprocessableEntityException({ code: 'SUBSCRIPTION_CANCELLED', message: 'Subscription is already cancelled' });
    }

    if (dto.status) order.status = dto.status;
    if (dto.interval) order.interval = dto.interval;
    if (dto.nextOrderDate !== undefined) order.nextOrderDate = dto.nextOrderDate;
    await order.save();

    return {
      data: toSubscriptionResponse(order.toObject() as Parameters<typeof toSubscriptionResponse>[0]),
      message: 'Subscription updated',
    };
  }

  private computeNextOrderDate(interval: 'weekly' | 'biweekly' | 'monthly' | 'quarterly'): string {
    const next = new Date();
    next.setDate(next.getDate() + INTERVAL_DAYS[interval]);
    return next.toISOString();
  }

  // Idempotent — matches on current paymentStatus so a replayed webhook is a no-op. Never
  // throws: Safepay expects a 2xx ack within 10s regardless of whether the order was recognized.
  async handleSafepayEvent(event: SafepayWebhookEvent): Promise<void> {
    const orderId = extractOrderId(event);
    if (!orderId || !Types.ObjectId.isValid(orderId)) {
      this.logger.warn(`Safepay webhook missing/invalid order_id: ${JSON.stringify(event)}`);
      return;
    }
    const orderObjectId = new Types.ObjectId(orderId);

    if (event.type === 'payment.succeeded') {
      const order = await this.orderModel.findById(orderObjectId).lean().exec();
      if (!order || order.paymentStatus !== 'pending') {
        this.logger.warn(`Safepay payment.succeeded: no matching pending order for ${orderId}`);
        return;
      }

      const paidAmount = extractAmount(event);
      if (paidAmount !== undefined && paidAmount !== order.totalAmount) {
        this.logger.error(
          `Safepay payment.succeeded: amount mismatch for order ${orderId} — expected ${order.totalAmount}, got ${paidAmount}. Not marking paid.`,
        );
        return;
      }

      const updated = await this.orderModel
        .findOneAndUpdate(
          { _id: orderObjectId, paymentStatus: 'pending' },
          { $set: { paymentStatus: 'paid', paidAt: new Date() } },
          { new: true },
        )
        .exec();
      if (!updated) {
        this.logger.warn(`Safepay payment.succeeded: order ${orderId} already processed by a concurrent webhook delivery`);
      }
      return;
    }

    if (event.type === 'payment.failed') {
      const updated = await this.orderModel
        .findOneAndUpdate(
          { _id: orderObjectId, paymentStatus: 'pending' },
          { $set: { status: 'cancelled' } },
          { new: true },
        )
        .exec();
      if (!updated) {
        this.logger.warn(`Safepay payment.failed: no matching pending order for ${orderId}`);
      } else {
        // Stock was reserved at placeOrder() time, before payment outcome was known — a failed
        // payment means the reservation never converts to a real sale, so it must be released.
        await this.restoreStock(updated.items);
      }
      return;
    }

    this.logger.log(`Ignoring unhandled Safepay event type: ${event.type}`);
  }

  // Routing check for the shared Safepay webhook entry point (appointments controller owns the
  // single endpoint Safepay actually delivers to, see AppointmentsWebhookController) — lets it
  // find out this event belongs to a store order before delegating to handleSafepayEvent above.
  async ownsOrderId(orderId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(orderId)) return false;
    return (await this.orderModel.exists({ _id: orderId })) !== null;
  }

  // Owner opened Safepay checkout and never completed, failed, or explicitly cancelled it —
  // same abandoned-checkout cleanup pattern as appointments/consultations, so a stale order
  // doesn't sit in the customer's order list forever.
  @Cron(CronExpression.EVERY_HOUR)
  async cancelAbandonedPendingPaymentOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - ORDER_PENDING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
    // Looped rather than a bulk updateMany so each order's reserved stock can be restored
    // individually — a bulk update has no per-document items to hand to restoreStock().
    const stale = await this.orderModel
      .find({
        paymentMethod: 'safepay',
        paymentStatus: 'pending',
        status: 'pending',
        createdAt: { $lt: cutoff },
      })
      .exec();

    let cancelled = 0;
    for (const order of stale) {
      const claimed = await this.orderModel
        .findOneAndUpdate(
          { _id: order._id, status: 'pending' },
          { $set: { status: 'cancelled' } },
          { new: true },
        )
        .exec();
      if (!claimed) continue;
      await this.restoreStock(claimed.items);
      cancelled++;
    }

    if (cancelled > 0) {
      this.logger.log(`Cancelled ${cancelled} abandoned pending-payment order(s)`);
    }
  }

  // Store owner never confirmed a paid order within ORDER_CONFIRMATION_TIMEOUT_HOURS — the
  // established-marketplace safety net this platform was otherwise missing entirely (see
  // ORDER_CONFIRMATION_TIMEOUT_HOURS comment). Auto-cancels and refunds via Safepay so the
  // customer's money doesn't sit in limbo indefinitely just because a store went unresponsive.
  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelUnconfirmedPaidOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - ORDER_CONFIRMATION_TIMEOUT_HOURS * 60 * 60 * 1000);
    const stale = await this.orderModel
      .find({
        paymentMethod: 'safepay',
        paymentStatus: 'paid',
        status: 'pending',
        paidAt: { $lt: cutoff },
      })
      .exec();

    let processed = 0;
    for (const order of stale) {
      if (!order.paymentReference) {
        this.logger.error(`Auto-cancel: paid safepay order ${order._id.toString()} has no paymentReference, skipping`);
        continue;
      }

      // Atomically claim before calling the external refund API — if the store confirmed this
      // order in the moment between our find() and this update, status won't be 'pending'
      // anymore and this no-ops, so we never refund an order that was legitimately actioned.
      const claimed = await this.orderModel
        .findOneAndUpdate(
          { _id: order._id, paymentStatus: 'paid', status: 'pending' },
          { $set: { paymentStatus: 'refunded', status: 'cancelled' } },
          { new: true },
        )
        .exec();
      if (!claimed) continue;

      try {
        await this.safepayService.refundPayment(order.paymentReference, order.totalAmount);
      } catch {
        // Refund call failed — revert the claim so the next hourly tick retries, rather than
        // leaving the order marked 'refunded' while no money actually moved.
        await this.orderModel
          .updateOne({ _id: order._id }, { $set: { paymentStatus: 'paid', status: 'pending' } })
          .exec();
        this.logger.error(`Auto-cancel: Safepay refund failed for order ${order._id.toString()}, reverted for retry`);
        continue;
      }

      await this.restoreStock(order.items);

      await this.notificationsService.createForRecipients(
        [order.user as Types.ObjectId],
        'user',
        'order_cancelled',
        'Order cancelled and refunded',
        `Your order ${order.orderId} wasn't confirmed by the store in time — PKR ${order.totalAmount} has been refunded.`,
        (order._id as Types.ObjectId).toString(),
      );
      processed++;
    }

    if (processed > 0) {
      this.logger.log(`Auto-cancelled and refunded ${processed} unconfirmed paid order(s)`);
    }
  }

  // Reserves stock for every item in one order, atomically per item so a concurrent order for
  // the same product can't both succeed against the same units. Rolls back everything already
  // reserved in this call if a later item fails, so a multi-item order never partially reserves.
  private async reserveStock(
    items: { product: Types.ObjectId; qty: number; name: string }[],
  ): Promise<void> {
    const reserved: { product: Types.ObjectId; qty: number }[] = [];
    for (const item of items) {
      const updated = await this.productModel
        .findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty } },
          { new: true },
        )
        .exec();
      if (!updated) {
        await this.restoreStock(reserved);
        throw new UnprocessableEntityException({
          code: 'OUT_OF_STOCK',
          message: `${item.name} is out of stock`,
        });
      }
      reserved.push({ product: item.product, qty: item.qty });
      if (updated.stock <= 0) {
        await this.productModel
          .updateOne({ _id: item.product }, { $set: { inStock: false } })
          .exec();
      }
    }
  }

  // Returns reserved stock to a product — order cancellation from any path (owner/store action,
  // Safepay payment.failed, or either auto-cancel cron) must call this so a cancelled order's
  // units become orderable again instead of staying permanently reserved.
  private async restoreStock(
    items: { product: Types.ObjectId; qty: number }[],
  ): Promise<void> {
    for (const item of items) {
      await this.productModel
        .updateOne({ _id: item.product }, { $inc: { stock: item.qty }, $set: { inStock: true } })
        .exec();
    }
  }

  // Product.sold was previously never written anywhere — always stuck at its schema default of
  // 0, which made the 'popular' sort inert and store-portal's "Total Sold" stat permanently
  // wrong. Incremented on delivery specifically (not order placement, unlike stock) since
  // 'sold' should mean a completed sale — delivery is also the point this system already treats
  // as final (paymentStatus flips to 'paid' here too), and cancellation only ever happens
  // pre-delivery in this status machine, so there's no reversal case to handle.
  private async incrementSold(
    items: { product: Types.ObjectId; qty: number }[],
  ): Promise<void> {
    for (const item of items) {
      await this.productModel
        .updateOne({ _id: item.product }, { $inc: { sold: item.qty } })
        .exec();
    }
  }
}
