import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ClinicDocument = HydratedDocument<Clinic> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Clinic {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['jazzcash', 'easypaisa', 'bank_transfer'], default: null })
  payoutMethod: 'jazzcash' | 'easypaisa' | 'bank_transfer' | null;

  @Prop({ type: String, default: null })
  accountTitle: string | null;

  // Wallet number (JazzCash/Easypaisa) — required when payoutMethod is 'jazzcash' or 'easypaisa'.
  @Prop({ type: String, default: null })
  walletNumber: string | null;

  // Required when payoutMethod is 'bank_transfer'.
  @Prop({ type: String, default: null })
  bankName: string | null;

  // Bank account number or IBAN — required when payoutMethod is 'bank_transfer'.
  @Prop({ type: String, default: null })
  accountNumber: string | null;

  @Prop({ type: String, default: null })
  cnicOnAccount: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  ownerId: Types.ObjectId;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);
