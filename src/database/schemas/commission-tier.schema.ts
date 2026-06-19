import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommissionTierDocument = HydratedDocument<CommissionTier> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class CommissionTier {
  @Prop({ required: true, trim: true })
  tier: string;

  @Prop({ required: true })
  rate: string;

  @Prop({ required: true })
  appliesTo: string;
}

export const CommissionTierSchema = SchemaFactory.createForClass(CommissionTier);
