import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true })
  pet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true, unique: true })
  appointment: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String, default: null })
  comment: string | null;

  @Prop({ required: true })
  petType: string;

  @Prop({ type: String, default: null })
  reply: string | null;

  @Prop({ type: String, default: null })
  reviewerName: string | null;

  @Prop({ type: String, default: null })
  petName: string | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ vet: 1, createdAt: -1 });
