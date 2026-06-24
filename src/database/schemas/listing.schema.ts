import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ListingDocument = HydratedDocument<Listing> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Listing {
  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    enum: ['medicine', 'food', 'treats', 'accessories', 'grooming', 'supplements'],
    index: true,
  })
  category: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 0, min: 0 })
  inStock: number;

  @Prop({ default: 0, min: 0 })
  sold: number;

  @Prop({ type: String, default: null })
  photo: string | null;

  @Prop({
    type: String,
    enum: ['active', 'hidden'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'hidden';
}

export const ListingSchema = SchemaFactory.createForClass(Listing);

ListingSchema.index({ vet: 1, status: 1 });
