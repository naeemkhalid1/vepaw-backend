import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomInt } from 'crypto';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { ServiceResponse, ProductResponse, OrderResponse } from '../../shared/types';
import { toProductResponse, toOrderResponse } from '../../shared/mappers/store.mapper';
import { ListProductsDto } from './dto/list-products.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateSubscriptionDto } from '../subscriptions/dto/update-subscription.dto';

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);

@Injectable()
export class StoreService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
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
    const orderId = `PC-${randomInt(100000, 999999)}`;

    const order = await this.orderModel.create({
      orderId,
      user: userId,
      store,
      storeName,
      items: orderItems,
      totalAmount: serverTotal,
      platformCommission: 0,
      storePayout: serverTotal,
      paymentMethod: dto.paymentMethod,
      deliveryAddress: dto.deliveryAddress,
    });

    return {
      data: toOrderResponse(order.toObject() as Parameters<typeof toOrderResponse>[0]),
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

  async listSubscriptions(userId: string, page: number, limit: number): Promise<ServiceResponse<OrderResponse[]>> {
    const filter = { user: userId, isSubscription: true };
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      data: orders.map((o) => toOrderResponse(o as Parameters<typeof toOrderResponse>[0])),
      message: 'Subscriptions retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSubscription(userId: string, orderId: string): Promise<ServiceResponse<OrderResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId, isSubscription: true }).lean();
    if (!order) throw new NotFoundException({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' });

    return {
      data: toOrderResponse(order as Parameters<typeof toOrderResponse>[0]),
      message: 'Subscription retrieved',
    };
  }

  async updateSubscription(userId: string, orderId: string, dto: UpdateSubscriptionDto): Promise<ServiceResponse<OrderResponse>> {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId, isSubscription: true });
    if (!order) throw new NotFoundException({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' });

    if (order.status === 'cancelled') {
      throw new UnprocessableEntityException({ code: 'SUBSCRIPTION_CANCELLED', message: 'Subscription is already cancelled' });
    }

    if (dto.status) order.status = dto.status;
    if (dto.nextOrderDate !== undefined) order.nextOrderDate = dto.nextOrderDate;
    await order.save();

    return {
      data: toOrderResponse(order.toObject() as Parameters<typeof toOrderResponse>[0]),
      message: 'Subscription updated',
    };
  }
}
