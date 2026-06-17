import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  photo: string;

  @Prop({ required: true, min: 1 })
  qty: number;

  @Prop({ required: true, min: 0 })
  price: number;
}

const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

export type OrderDocument = HydratedDocument<Order> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true })
  orderId: string; // PC-XXXXXX

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ required: true })
  storeName: string;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, min: 0, default: 0 })
  platformCommission: number;

  @Prop({ required: true, min: 0 })
  storePayout: number;

  @Prop({
    type: String,
    enum: ['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled';

  @Prop({
    type: String,
    enum: ['jazzcash', 'easypaisa', 'cod'],
    required: true,
  })
  paymentMethod: 'jazzcash' | 'easypaisa' | 'cod';

  @Prop({
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending',
  })
  paymentStatus: 'pending' | 'paid' | 'refunded';

  @Prop({
    type: {
      street: { type: String, required: true },
      area: { type: String, required: true },
      city: { type: String, required: true },
      label: { type: String, enum: ['Home', 'Work', 'Other', null], default: null },
    },
    required: true,
  })
  deliveryAddress: { street: string; area: string; city: string; label: string | null };

  @Prop({ default: false })
  isSubscription: boolean;

  @Prop({ type: String, default: null })
  nextOrderDate: string | null;

  @Prop({ type: String, default: null })
  estimatedDelivery: string | null;

  @Prop({
    type: { name: { type: String }, phone: { type: String } },
    default: null,
  })
  rider: { name: string; phone: string } | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ store: 1, status: 1 });
