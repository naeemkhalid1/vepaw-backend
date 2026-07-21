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

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly safepayService: SafepayService,
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
    const sort = sortMap[dto.sort ?? 'newest'];

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
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

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto): Promise<ServiceResponse<OrderResponse>> {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    if (TERMINAL_STATUSES.has(order.status)) {
      throw new UnprocessableEntityException({ code: 'ORDER_TERMINAL', message: 'Order is already in a terminal state' });
    }

    // Same gate established marketplaces apply before a seller can act on an order — a safepay
    // order that hasn't actually been paid for yet can't be advanced through fulfillment.
    if (order.paymentMethod === 'safepay' && order.paymentStatus !== 'paid') {
      throw new BadRequestException({ code: 'PAYMENT_NOT_CONFIRMED', message: 'Cannot update order status until payment is confirmed' });
    }

    if (dto.status === 'dispatched' && !dto.rider) {
      throw new BadRequestException({ code: 'RIDER_REQUIRED', message: 'Rider details are required when dispatching an order' });
    }

    order.status = dto.status;
    if (dto.rider) order.rider = dto.rider;
    if (dto.status === 'delivered') order.paymentStatus = 'paid';
    await order.save();

    return {
      data: toOrderResponse(order.toObject() as Parameters<typeof toOrderResponse>[0]),
      message: 'Order status updated',
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
          { $set: { paymentStatus: 'paid' } },
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
      }
      return;
    }

    this.logger.log(`Ignoring unhandled Safepay event type: ${event.type}`);
  }

  // Owner opened Safepay checkout and never completed, failed, or explicitly cancelled it —
  // same abandoned-checkout cleanup pattern as appointments/consultations, so a stale order
  // doesn't sit in the customer's order list forever.
  @Cron(CronExpression.EVERY_HOUR)
  async cancelAbandonedPendingPaymentOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - ORDER_PENDING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
    const result = await this.orderModel
      .updateMany(
        {
          paymentMethod: 'safepay',
          paymentStatus: 'pending',
          status: 'pending',
          createdAt: { $lt: cutoff },
        },
        { $set: { status: 'cancelled' } },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.log(`Cancelled ${result.modifiedCount} abandoned pending-payment order(s)`);
    }
  }
}
