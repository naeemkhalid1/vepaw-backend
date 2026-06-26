import { Types } from 'mongoose';
import { Product } from '../../database/schemas/product.schema';
import { Order, OrderItem } from '../../database/schemas/order.schema';
import { ProductResponse, ProductVariantResponse, OrderResponse, OrderItemResponse } from '../types';

type ProductLean = Omit<Product, '_id'> & { _id: Types.ObjectId; createdAt: Date };
type OrderItemLean = Omit<OrderItem, '_id'>;
type OrderLean = Omit<Order, '_id'> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

function toOrderItemResponse(item: OrderItemLean): OrderItemResponse {
  return {
    product: (item.product as Types.ObjectId).toString(),
    name: item.name,
    photo: item.photo,
    qty: item.qty,
    price: item.price,
  };
}

export function toProductResponse(product: ProductLean): ProductResponse {
  return {
    id: product._id.toString(),
    store: (product.store as Types.ObjectId).toString(),
    storeName: product.storeName,
    name: product.name,
    photo: product.photo,
    description: product.description,
    category: product.category,
    petTypes: product.petTypes,
    brand: product.brand,
    weight: product.weight,
    price: product.price,
    originalPrice: product.originalPrice,
    inStock: product.inStock,
    variants: (product.variants ?? []).map((v: { _id?: Types.ObjectId; label: string; price: number; originalPrice: number | null; inStock: boolean }): ProductVariantResponse => ({
      id: v._id?.toString() ?? '',
      label: v.label,
      price: v.price,
      originalPrice: v.originalPrice,
      inStock: v.inStock,
    })),
    isVetRecommended: product.isVetRecommended,
    recommendedBy: product.recommendedBy,
    createdAt: product.createdAt,
  };
}

export function toOrderResponse(order: OrderLean): OrderResponse {
  return {
    id: order._id.toString(),
    orderId: order.orderId,
    user: (order.user as Types.ObjectId).toString(),
    store: (order.store as Types.ObjectId).toString(),
    storeName: order.storeName,
    items: order.items.map(toOrderItemResponse),
    totalAmount: order.totalAmount,
    platformCommission: order.platformCommission,
    storePayout: order.storePayout,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryAddress: order.deliveryAddress,
    isSubscription: order.isSubscription,
    nextOrderDate: order.nextOrderDate,
    estimatedDelivery: order.estimatedDelivery,
    rider: order.rider,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
