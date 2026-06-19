import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BroadcastDocument = HydratedDocument<Broadcast> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Broadcast {
  @Prop({ required: true, trim: true })
  campaign: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: [String], required: true })
  audience: string[];

  @Prop({ type: [String], required: true })
  channels: string[];

  @Prop({ type: String, default: null })
  scheduledAt: string | null;

  @Prop({ type: String, default: null })
  openRate: string | null;

  @Prop({
    type: String,
    enum: ['sent', 'scheduled'],
    default: 'sent',
    index: true,
  })
  status: 'sent' | 'scheduled';
}

export const BroadcastSchema = SchemaFactory.createForClass(Broadcast);

BroadcastSchema.index({ status: 1, createdAt: -1 });
