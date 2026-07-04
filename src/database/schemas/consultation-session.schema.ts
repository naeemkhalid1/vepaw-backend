import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConsultationSessionDocument = HydratedDocument<ConsultationSession> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class ConsultationSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true, index: true })
  pet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true })
  thread: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    type: String,
    enum: ['pending_payment', 'payment_submitted', 'active', 'closed', 'expired'],
    default: 'pending_payment',
    index: true,
  })
  status: 'pending_payment' | 'payment_submitted' | 'active' | 'closed' | 'expired';

  @Prop({ type: String, default: null })
  paymentProofUrl: string | null;

  @Prop({ type: Date, default: null })
  paymentSubmittedAt: Date | null;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  autoExpireAt: Date | null;

  @Prop({ type: Date, default: null })
  closedAt: Date | null;

  @Prop({ type: String, enum: ['vet', 'system'], default: null })
  closedBy: 'vet' | 'system' | null;
}

export const ConsultationSessionSchema = SchemaFactory.createForClass(ConsultationSession);

ConsultationSessionSchema.index({ vet: 1, status: 1 });
ConsultationSessionSchema.index({ owner: 1, status: 1 });
