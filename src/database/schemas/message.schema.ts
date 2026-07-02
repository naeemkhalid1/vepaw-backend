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

  @Prop({ type: String, enum: ['own_listing', 'store_product'], default: null })
  source: 'own_listing' | 'store_product' | null;
}

const ProductRecommendationSchema = SchemaFactory.createForClass(ProductRecommendation);

@Schema({ _id: false })
class PetShare {
  @Prop({ required: true }) petId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) species: string;
  @Prop({ required: true }) breed: string;
  @Prop({ required: true }) age: string;
  @Prop({ required: true }) weight: number;
  @Prop({ required: true }) gender: string;
  @Prop({ type: String, default: null }) vaccinationStatus: string | null;
  @Prop({ type: [String], default: [] }) allergies: string[];
  @Prop({ type: [String], default: [] }) currentMedications: string[];
}

const PetShareSchema = SchemaFactory.createForClass(PetShare);

export type MessageDocument = HydratedDocument<Message> & { createdAt: Date };

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true, index: true })
  thread: Types.ObjectId;

  @Prop({ type: String, enum: ['text', 'product_recommendation', 'pet_share'], required: true })
  type: 'text' | 'product_recommendation' | 'pet_share';

  @Prop({ type: String, enum: ['user', 'doctor', 'ai'], required: true })
  sender: 'user' | 'doctor' | 'ai';

  @Prop({ type: String, default: null })
  text: string | null;

  @Prop({ type: ProductRecommendationSchema, default: null })
  product: ProductRecommendation | null;

  @Prop({ type: PetShareSchema, default: null })
  pet: PetShare | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ thread: 1, createdAt: 1 });
