import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: true })
export class Vaccination {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  date: string; // YYYY-MM-DD

  @Prop({ required: true })
  nextDue: string; // YYYY-MM-DD

  @Prop({ type: Types.ObjectId, ref: 'Vet', default: null })
  vetId: Types.ObjectId | null;

  @Prop({ required: true })
  vetName: string;

  @Prop({ default: false })
  verified: boolean;

  @Prop({ type: String, default: null })
  notes: string | null;

  @Prop({ type: String, default: null })
  certificatePhoto: string | null;
}

const VaccinationSchema = SchemaFactory.createForClass(Vaccination);

export type PetDocument = HydratedDocument<Pet> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Pet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['dog', 'cat', 'bird', 'exotic', 'other'] })
  species: string;

  @Prop({ required: true, trim: true })
  breed: string;

  @Prop({ required: true })
  dateOfBirth: string; // YYYY-MM-DD

  @Prop({ required: true })
  weight: number;

  @Prop({ required: true, enum: ['male', 'female'] })
  gender: string;

  @Prop({ type: String, default: null })
  color: string | null;

  @Prop({ type: String, default: null })
  photo: string | null;

  @Prop({ type: [VaccinationSchema], default: [] })
  vaccinations: Vaccination[];

  @Prop({ type: [String], default: [] })
  medicalHistory: string[];

  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop({ type: [String], default: [] })
  currentMedications: string[];

  @Prop({
    type: String,
    enum: ['up_to_date', 'some_pending', 'not_sure'],
    default: null,
  })
  vaccinationStatus: 'up_to_date' | 'some_pending' | 'not_sure' | null;

  @Prop({ default: true })
  remindersEnabled: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, default: null })
  passportUrl: string | null;
}

export const PetSchema = SchemaFactory.createForClass(Pet);

PetSchema.index({ owner: 1, isActive: 1 });
