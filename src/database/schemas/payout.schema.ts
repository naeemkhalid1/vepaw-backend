import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PayoutDocument = HydratedDocument<Payout> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Payout {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  entityId: Types.ObjectId;

  @Prop({ required: true, enum: ['vet', 'store'] })
  entityType: 'vet' | 'store';

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 0, min: 0 })
  orders: number;

  @Prop({ default: 0, min: 0 })
  gross: number;

  @Prop({ default: 0, min: 0 })
  commission: number;

  @Prop({ default: 0, min: 0 })
  netPaid: number;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed'],
    default: 'completed',
  })
  status: 'pending' | 'processing' | 'completed';

  // Null when this batch was created by the weekly auto-batch cron rather than a specific
  // admin_vet/manager clicking "withdraw" — distinguishes system-triggered from user-triggered.
  @Prop({ type: Types.ObjectId, ref: 'Vet', default: null })
  requestedBy: Types.ObjectId | null;

  // Filled in when an admin confirms the manual transfer (bank/wallet) was actually sent.
  @Prop({ type: String, default: null })
  transactionReference: string | null;

  @Prop({ type: Date, default: null })
  settledAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  settledBy: Types.ObjectId | null;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

PayoutSchema.index({ entityId: 1, entityType: 1, createdAt: -1 });
