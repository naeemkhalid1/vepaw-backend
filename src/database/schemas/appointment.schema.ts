import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AppointmentDocument = HydratedDocument<Appointment> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true })
  pet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  date: string; // YYYY-MM-DD

  @Prop({ required: true })
  timeSlot: string; // HH:MM

  @Prop({
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';

  @Prop({ required: true, min: 0 })
  fee: number;

  @Prop({ required: true, min: 0 })
  platformCommission: number;

  @Prop({ required: true, min: 0 })
  vetPayout: number;

  @Prop({
    type: String,
    enum: ['jazzcash', 'easypaisa', 'cod'],
    required: true,
  })
  paymentMethod: 'jazzcash' | 'easypaisa' | 'cod';

  @Prop({
    type: String,
    enum: ['pending', 'held', 'released', 'refunded'],
    default: 'pending',
  })
  paymentStatus: 'pending' | 'held' | 'released' | 'refunded';

  @Prop({ type: String, default: null })
  paymentReference: string | null;

  @Prop({ type: String, default: null })
  notes: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Review', default: null })
  reviewId: Types.ObjectId | null;

  @Prop({
    type: {
      name: { type: String, required: true },
      clinicName: { type: String, required: true },
      address: { type: String, required: true },
      phone: { type: String, required: true },
    },
    required: true,
  })
  vetDetails: { name: string; clinicName: string; address: string; phone: string };

  @Prop({
    type: {
      name: { type: String, required: true },
      species: { type: String, required: true },
    },
    required: true,
  })
  petDetails: { name: string; species: string };
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

AppointmentSchema.index({ vet: 1, date: 1 });
AppointmentSchema.index({ owner: 1, createdAt: -1 });
AppointmentSchema.index({ vet: 1, status: 1 });
