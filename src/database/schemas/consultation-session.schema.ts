import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const CONSULTATION_STATUSES = [
  'pending_payment',
  'active',
  'disputed',
  'closed',
  'expired',
  'cancelled',
] as const;

export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

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

  @Prop({ type: Types.ObjectId, ref: 'Clinic', default: null, index: true })
  clinicId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true })
  thread: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  // Percentage-based (not the flat PKR constant appointments use) — text-consult fees are
  // priced much lower than in-person appointments, see CONSULTATION_COMMISSION_RATE.
  @Prop({ required: true, min: 0 })
  platformCommission: number;

  @Prop({ required: true, min: 0 })
  vetPayout: number;

  // Set once this session's vetPayout has been included in a batched Payout — same
  // double-payment guard as Appointment.payoutId.
  @Prop({ type: Types.ObjectId, ref: 'Payout', default: null })
  payoutId: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: CONSULTATION_STATUSES,
    default: 'pending_payment',
    index: true,
  })
  status: ConsultationStatus;

  // Safepay tracker token — the webhook matches on this to apply payment.succeeded/failed events.
  @Prop({ type: String, default: null })
  paymentReference: string | null;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  autoExpireAt: Date | null;

  @Prop({ type: Date, default: null })
  closedAt: Date | null;

  @Prop({ type: String, enum: ['vet', 'system', 'admin'], default: null })
  closedBy: 'vet' | 'system' | 'admin' | null;

  @Prop({ type: Types.ObjectId, ref: 'Vet', default: null })
  resolvedBy: Types.ObjectId | null;

  @Prop({ type: String, enum: ['admin_vet', 'team_vet', 'manager'], default: null })
  resolvedByRole: 'admin_vet' | 'team_vet' | 'manager' | null;

  @Prop({ type: String, default: null })
  disputeReason: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  adminResolvedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  adminResolvedAt: Date | null;

  @Prop({ default: false })
  refundRequired: boolean;
}

export const ConsultationSessionSchema = SchemaFactory.createForClass(ConsultationSession);

ConsultationSessionSchema.index({ vet: 1, status: 1 });
ConsultationSessionSchema.index({ owner: 1, status: 1 });
ConsultationSessionSchema.index({ clinicId: 1, status: 1 });
