import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PayoutAccountAuditDocument = HydratedDocument<PayoutAccountAudit> & {
  createdAt: Date;
  updatedAt: Date;
};

class PayoutAccountSnapshot {
  @Prop({ type: String, default: null })
  payoutMethod: 'jazzcash' | 'easypaisa' | 'bank_transfer' | null;

  @Prop({ type: String, default: null })
  accountTitle: string | null;

  @Prop({ type: String, default: null })
  walletNumber: string | null;

  @Prop({ type: String, default: null })
  bankName: string | null;

  @Prop({ type: String, default: null })
  accountNumber: string | null;
}

// One entry per change to a Clinic's or Store's payout account — who changed it, from what, to
// what. Never edited or deleted after creation; the record IS the audit trail. Shared between
// vet-portal and store-portal (entityType distinguishes which); entityId is a Clinic._id for
// vets, a Store._id for stores.
@Schema({ timestamps: true })
export class PayoutAccountAudit {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  entityId: Types.ObjectId;

  @Prop({ required: true, enum: ['vet', 'store'] })
  entityType: 'vet' | 'store';

  @Prop({ type: Types.ObjectId, required: true })
  changedBy: Types.ObjectId;

  @Prop({ required: true })
  changedByName: string;

  // Vet staff role (admin_vet/team_vet/manager) when entityType is 'vet' — always null for
  // store changes, since stores don't have a multi-staff role structure.
  @Prop({ type: String, default: null })
  changedByRole: string | null;

  // null on the very first time a payout account is ever set for this entity.
  @Prop({ type: PayoutAccountSnapshot, default: null })
  previousValues: PayoutAccountSnapshot | null;

  @Prop({ type: PayoutAccountSnapshot, required: true })
  newValues: PayoutAccountSnapshot;
}

export const PayoutAccountAuditSchema = SchemaFactory.createForClass(PayoutAccountAudit);

PayoutAccountAuditSchema.index({ entityId: 1, entityType: 1, createdAt: -1 });
