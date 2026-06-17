import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification> & { createdAt: Date };

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['vaccination', 'order_delivery', 'order_delivered', 'message', 'booking', 'rating'],
  })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String, default: null })
  subtitle: string | null;

  @Prop({ default: false })
  read: boolean;

  @Prop({ type: String, default: null })
  targetId: string | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, read: 1 });
