import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ThreadDocument = HydratedDocument<Thread> & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true })
export class Thread {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: ['ai', 'vet', 'store'], required: true })
  type: 'ai' | 'vet' | 'store';

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, default: null })
  preview: string | null;

  @Prop({ default: 0, min: 0 })
  unread: number;

  @Prop({ default: false })
  verified: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  vetId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId: Types.ObjectId | null;
}

export const ThreadSchema = SchemaFactory.createForClass(Thread);

ThreadSchema.index({ user: 1, updatedAt: -1 });
ThreadSchema.index({ user: 1, type: 1 });
