import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export interface WorkingDay {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface WorkingHours {
  mon: WorkingDay;
  tue: WorkingDay;
  wed: WorkingDay;
  thu: WorkingDay;
  fri: WorkingDay;
  sat: WorkingDay;
  sun: WorkingDay;
}

const workingDayDef = {
  open: { type: String, default: '09:00' },
  close: { type: String, default: '18:00' },
  isOpen: { type: Boolean, default: false },
};

const defaultWorkingHours = (): WorkingHours => ({
  mon: { open: '09:00', close: '18:00', isOpen: true },
  tue: { open: '09:00', close: '18:00', isOpen: true },
  wed: { open: '09:00', close: '18:00', isOpen: true },
  thu: { open: '09:00', close: '18:00', isOpen: true },
  fri: { open: '09:00', close: '18:00', isOpen: true },
  sat: { open: '09:00', close: '14:00', isOpen: true },
  sun: { open: '09:00', close: '14:00', isOpen: false },
});

export type VetDocument = HydratedDocument<Vet> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Vet {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  clinicName: string;

  @Prop({ type: String, default: null })
  photo: string | null;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ type: String, default: null, select: false })
  password: string | null;

  @Prop({ required: true })
  phone: string;

  @Prop({
    type: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true },
    },
    default: () => ({ type: 'Point', coordinates: [74.3436, 31.5204] }), // Lahore center
  })
  location: { type: string; coordinates: number[] };

  @Prop({ required: true })
  address: string;

  @Prop({ default: 'Lahore' })
  city: string;

  @Prop({ required: true })
  area: string;

  @Prop({
    type: { min: { type: Number, required: true }, max: { type: Number, required: true } },
    required: true,
  })
  fee: { min: number; max: number };

  @Prop({ type: String, default: null })
  specialty: string | null;

  @Prop({ type: String, default: null })
  about: string | null;

  @Prop({ type: Number, default: null })
  yearsExperience: number | null;

  @Prop({ type: [String], default: [] })
  specializations: string[];

  @Prop({ type: [String], default: ['en'] })
  languages: string[];

  @Prop({
    type: {
      mon: workingDayDef,
      tue: workingDayDef,
      wed: workingDayDef,
      thu: workingDayDef,
      fri: workingDayDef,
      sat: workingDayDef,
      sun: workingDayDef,
    },
    default: defaultWorkingHours,
  })
  workingHours: WorkingHours;

  @Prop({ default: false })
  is24Hours: boolean;

  @Prop({ default: false })
  isEmergency: boolean;

  @Prop({ type: Number, default: null })
  radiusKm: number | null;

  @Prop({ default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ default: 0 })
  reviewCount: number;

  @Prop({ default: false, index: true })
  verified: boolean;

  @Prop({
    type: String,
    enum: ['active', 'inactive'],
    default: 'inactive',
    index: true,
  })
  subscriptionStatus: 'active' | 'inactive';

  @Prop({ default: false })
  featured: boolean;

  @Prop({ type: String, default: null })
  pvmcNumber: string | null;

  @Prop({ type: String, default: null })
  primaryQualification: string | null;

  @Prop({ type: String, default: null })
  university: string | null;

  @Prop({ type: String, default: null })
  additionalCertifications: string | null;

  @Prop({ type: String, default: null })
  pvmcLicense: string | null;

  @Prop({ type: String, default: null })
  degreeCertificate: string | null;

  @Prop({ type: String, default: null })
  cnicDocument: string | null;

  @Prop({ type: String, default: null })
  clinicPhoto: string | null;

  @Prop({ type: String, default: null })
  payoutMethod: string | null;

  @Prop({ type: String, default: null })
  accountTitle: string | null;

  @Prop({ type: String, default: null })
  mobileAccount: string | null;

  @Prop({ type: String, default: null })
  cnicOnAccount: string | null;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
    index: true,
  })
  applicationStatus: 'pending' | 'approved' | 'rejected';
}

export const VetSchema = SchemaFactory.createForClass(Vet);

VetSchema.index({ location: '2dsphere' });
VetSchema.index({ verified: 1, subscriptionStatus: 1, featured: -1, rating: -1 });
VetSchema.index({ area: 1 });
