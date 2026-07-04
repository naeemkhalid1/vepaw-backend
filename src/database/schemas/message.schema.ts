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
  @Prop({ type: String, default: null }) species: string | null;
  @Prop({ type: String, default: null }) breed: string | null;
  @Prop({ type: String, default: null }) age: string | null;
  @Prop({ type: Number, default: null }) weight: number | null;
  @Prop({ type: String, default: null }) gender: string | null;
  @Prop({ type: String, default: null }) vaccinationStatus: string | null;
  @Prop({ type: [String], default: [] }) allergies: string[];
  @Prop({ type: [String], default: [] }) currentMedications: string[];
}

const PetShareSchema = SchemaFactory.createForClass(PetShare);

@Schema({ _id: false })
class ClinicRequest {
  @Prop({ type: Types.ObjectId, ref: 'ClinicDispense', required: true })
  requestId: Types.ObjectId;

  @Prop({ required: true })
  itemName: string;

  @Prop({ required: true })
  qty: number;

  @Prop({
    type: String,
    enum: ['requested', 'confirmed', 'declined', 'dispensed', 'cancelled'],
    required: true,
  })
  status: 'requested' | 'confirmed' | 'declined' | 'dispensed' | 'cancelled';
}

const ClinicRequestSchema = SchemaFactory.createForClass(ClinicRequest);

@Schema({ _id: false })
class ConsultationStatus {
  @Prop({ type: Types.ObjectId, ref: 'ConsultationSession', required: true })
  sessionId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending_payment', 'payment_submitted', 'active', 'closed', 'expired'],
    required: true,
  })
  status: 'pending_payment' | 'payment_submitted' | 'active' | 'closed' | 'expired';
}

const ConsultationStatusSchema = SchemaFactory.createForClass(ConsultationStatus);

export type MessageDocument = HydratedDocument<Message> & { createdAt: Date };

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Thread', required: true, index: true })
  thread: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['text', 'product_recommendation', 'pet_share', 'clinic_request', 'consultation_status'],
    required: true,
  })
  type: 'text' | 'product_recommendation' | 'pet_share' | 'clinic_request' | 'consultation_status';

  @Prop({ type: String, enum: ['user', 'doctor', 'ai'], required: true })
  sender: 'user' | 'doctor' | 'ai';

  @Prop({ type: String, default: null })
  text: string | null;

  @Prop({ type: ProductRecommendationSchema, default: null })
  product: ProductRecommendation | null;

  @Prop({ type: PetShareSchema, default: null })
  pet: PetShare | null;

  @Prop({ type: ClinicRequestSchema, default: null })
  clinicRequest: ClinicRequest | null;

  @Prop({ type: ConsultationStatusSchema, default: null })
  consultationStatus: ConsultationStatus | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ thread: 1, createdAt: 1 });
