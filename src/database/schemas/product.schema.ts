import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  store: Types.ObjectId;

  @Prop({ required: true })
  storeName: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  photo: string | null;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({
    required: true,
    enum: ['food', 'medicine', 'accessories', 'grooming', 'treats'],
    index: true,
  })
  category: string;

  @Prop({ type: [String], default: [], index: true })
  petTypes: string[];

  @Prop({ type: String, default: null })
  brand: string | null;

  @Prop({ type: String, default: null })
  weight: string | null;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ type: Number, default: null })
  originalPrice: number | null;

  @Prop({ default: true, index: true })
  inStock: boolean;

  @Prop({ default: 0, min: 0 })
  stock: number;

  @Prop({ default: 0, min: 0 })
  sold: number;

  @Prop({
    type: String,
    enum: ['active', 'draft', 'lowStock', 'outOfStock', 'hidden'],
    default: 'active',
    index: true,
  })
  productStatus: 'active' | 'draft' | 'lowStock' | 'outOfStock' | 'hidden';

  @Prop({ default: false })
  requiresPrescription: boolean;

  @Prop({ type: String, default: null })
  batchNumber: string | null;

  @Prop({ type: String, default: null })
  expiryDate: string | null;

  @Prop({ type: String, default: null })
  sku: string | null;

  @Prop({ default: false })
  isVetRecommended: boolean;

  @Prop({ type: String, default: null })
  recommendedBy: string | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ store: 1, category: 1 });
ProductSchema.index({ name: 'text', description: 'text' });
