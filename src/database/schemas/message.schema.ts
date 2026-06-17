import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
class ProductRecommendation {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  pricePKR: number;

  @Prop({ required: true })
  storeId: string;

  @Prop({ required: true })
  storeName: string;
}

const ProductRecommendationSchema = SchemaFactory.createForClass(ProductRecommendation);

export type MessageDocument = HydratedDocument<Message> & { createdAt: Date };

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true, index: true })
  thread: Types.ObjectId;

  @Prop({ type: String, enum: ['text', 'product_recommendation'], required: true })
  type: 'text' | 'product_recommendation';

  @Prop({ type: String, enum: ['user', 'doctor', 'ai'], required: true })
  sender: 'user' | 'doctor' | 'ai';

  @Prop({ type: String, default: null })
  text: string | null;

  @Prop({ type: ProductRecommendationSchema, default: null })
  product: ProductRecommendation | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ thread: 1, createdAt: 1 });
