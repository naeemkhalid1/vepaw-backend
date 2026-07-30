import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  photo: string;

  @Prop({ type: String, default: null })
  variantId: string | null;

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
    enum: ['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'active', 'paused'],
    default: 'pending',
    index: true,
  })
  // 'active'/'paused' are subscription-lifecycle states (isSubscription: true orders only);
  // the rest are one-off fulfillment states.
  status: 'pending' | 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled' | 'active' | 'paused';

  @Prop({
    type: String,
    enum: ['safepay', 'cod'],
    required: true,
  })
  paymentMethod: 'safepay' | 'cod';

  @Prop({
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending',
  })
  paymentStatus: 'pending' | 'paid' | 'refunded';

  // Safepay tracker token — the webhook matches on this to apply payment.succeeded/failed
  // events. Null for 'cod' orders, which never call Safepay at all.
  @Prop({ type: String, default: null })
  paymentReference: string | null;

  // Card-network chargeback status from Safepay's payment.disputed/dispute.won/dispute.lost
  // webhooks — deliberately a separate field from `status`, which already has its own
  // unrelated meaning (fulfillment state). A chargeback is the customer's bank contesting the
  // charge directly with the card network, not the same thing as this app's own dispute flow.
  @Prop({
    type: String,
    enum: ['disputed', 'won', 'lost', null],
    default: null,
  })
  chargebackStatus: 'disputed' | 'won' | 'lost' | null;

  // Set when the Safepay webhook marks this order paid — anchors the auto-cancel-and-refund
  // cron's confirmation-timeout window, rather than relying on the generic updatedAt (which any
  // future order-mutating code could bump for unrelated reasons).
  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  // Set once this order's storePayout has been included in a batched Payout — excludes it from
  // future "available to withdraw" totals so it can't be paid out twice.
  @Prop({ type: Types.ObjectId, ref: 'Payout', default: null })
  payoutId: Types.ObjectId | null;

  @Prop({
    type: {
      street: { type: String, required: true },
      area: { type: String, default: '' },
      city: { type: String, required: true },
      label: { type: String, enum: ['Home', 'Work', 'Other', null], default: null },
    },
    required: true,
  })
  deliveryAddress: { street: string; area: string; city: string; label: string | null };

  @Prop({ default: false })
  isSubscription: boolean;

  @Prop({
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'quarterly', null],
    default: null,
  })
  interval: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | null;

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
