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

  @Prop({ type: String, default: null })
  payoutMethod: string | null;

  @Prop({ type: String, default: null })
  accountTitle: string | null;

  @Prop({ type: String, default: null })
  mobileAccount: string | null;

  @Prop({ type: String, default: null })
  cnicOnAccount: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  ownerId: Types.ObjectId;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);
