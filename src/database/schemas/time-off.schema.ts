import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TimeOffDocument = HydratedDocument<TimeOff> & {
  createdAt: Date;
};

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TimeOff {
  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  dateLabel: string;

  @Prop({ default: 'Day off' })
  reason: string;
}

export const TimeOffSchema = SchemaFactory.createForClass(TimeOff);

TimeOffSchema.index({ vet: 1, date: 1 });
