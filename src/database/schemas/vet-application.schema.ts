import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VetApplicationDocument = HydratedDocument<VetApplication> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class VetApplication {
  @Prop({ type: Types.ObjectId, ref: 'Vet', default: null })
  vetId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true, trim: true })
  clinicName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ default: 'Lahore' })
  city: string;

  @Prop({ required: true })
  area: string;

  @Prop({ required: true })
  fullAddress: string;

  @Prop({ type: [String], default: [] })
  specialisations: string[];

  @Prop({ required: true })
  feeMin: number;

  @Prop({ required: true })
  feeMax: number;

  @Prop({ type: [String], default: ['en'] })
  languages: string[];

  @Prop({ required: true })
  pvmcNumber: string;

  @Prop({ required: true })
  yearsOfExperience: number;

  @Prop({ required: true })
  primaryQualification: string;

  @Prop({ required: true })
  university: string;

  @Prop({ type: String, default: null })
  additionalCertifications: string | null;

  @Prop({ type: String, default: null })
  pvmcLicense: string | null;

  @Prop({ type: String, default: null })
  degreeCertificate: string | null;

  @Prop({ type: String, default: null })
  cnic: string | null;

  @Prop({ type: String, default: null })
  clinicPhoto: string | null;

  @Prop({ required: true })
  payoutMethod: string;

  @Prop({ required: true })
  accountTitle: string;

  @Prop({ required: true })
  mobileAccount: string;

  @Prop({ required: true })
  cnicOnAccount: string;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'approved' | 'rejected';

  @Prop({ type: String, default: null })
  rejectionReason: string | null;
}

export const VetApplicationSchema = SchemaFactory.createForClass(VetApplication);

VetApplicationSchema.index({ status: 1, createdAt: -1 });
VetApplicationSchema.index({ email: 1 });
