import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// A short-lived, safepay-only pre-image of an Appointment. Nothing else in the system should
// treat this as a real booking — it exists purely to soft-lock a slot while Safepay checkout is
// in progress, and either gets promoted into a real Appointment (payment.succeeded) or deleted
// (payment.failed, or left to expire via TTL if the user abandons checkout).
export type AppointmentReservationDocument =
  HydratedDocument<AppointmentReservation> & {
    createdAt: Date;
  };

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AppointmentReservation {
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

  @Prop({ required: true, min: 0 })
  fee: number;

  @Prop({ required: true, min: 0 })
  platformCommission: number;

  @Prop({ required: true, min: 0 })
  vetPayout: number;

  @Prop({
    type: {
      name: { type: String, required: true },
      clinicName: { type: String, required: true },
      address: { type: String, required: true },
      phone: { type: String, required: true },
    },
    required: true,
  })
  vetDetails: {
    name: string;
    clinicName: string;
    address: string;
    phone: string;
  };

  @Prop({
    type: {
      name: { type: String, required: true },
      species: { type: String, required: true },
    },
    required: true,
  })
  petDetails: { name: string; species: string };

  @Prop({ required: true })
  expiresAt: Date;

  // Safepay tracker token, set immediately at reservation creation since the backend now
  // creates the checkout session itself — see CODING_STANDARDS.md history for why this
  // replaced the earlier client-side-session model.
  @Prop({ type: String, default: null })
  paymentReference: string | null;
}

export const AppointmentReservationSchema = SchemaFactory.createForClass(
  AppointmentReservation,
);

AppointmentReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Unique — enforced by MongoDB itself, not application code, so two concurrent
// createReservation calls for the same slot can't both succeed (only one insert wins; the
// loser gets an E11000 duplicate-key error, translated into SLOT_UNAVAILABLE). Any expired
// reservation for a slot is explicitly deleted before a fresh insert is attempted, so this
// never falsely blocks a legitimately-new reservation against a stale, not-yet-TTL-swept one.
AppointmentReservationSchema.index(
  { vet: 1, date: 1, timeSlot: 1 },
  { unique: true },
);
