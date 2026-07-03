import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ClinicDispenseDocument = HydratedDocument<ClinicDispense> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class ClinicDispense {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true, index: true })
  pet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Listing', required: true })
  listing: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true })
  thread: Types.ObjectId;

  @Prop({ required: true, trim: true })
  itemName: string;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  qty: number;

  @Prop({
    type: String,
    enum: ['requested', 'confirmed', 'declined', 'dispensed', 'cancelled'],
    default: 'requested',
    index: true,
  })
  status: 'requested' | 'confirmed' | 'declined' | 'dispensed' | 'cancelled';

  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  @Prop({ type: Date, default: null })
  dispensedAt: Date | null;

  @Prop({ type: Date, default: null })
  declinedAt: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;
}

export const ClinicDispenseSchema = SchemaFactory.createForClass(ClinicDispense);

ClinicDispenseSchema.index({ vet: 1, status: 1 });
ClinicDispenseSchema.index({ owner: 1, status: 1 });
