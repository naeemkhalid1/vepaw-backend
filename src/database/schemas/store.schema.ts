import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StoreDocument = HydratedDocument<Store> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class Store {
  @Prop({ required: true, trim: true })
  storeName: string;

  @Prop({ required: true, trim: true })
  ownerName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, default: null })
  password: string | null;

  @Prop({ required: true })
  storeAddress: string;

  @Prop({ default: 'Lahore' })
  city: string;

  @Prop({ default: '' })
  areasServed: string;

  @Prop({ required: true })
  ntn: string;

  @Prop({ required: true })
  ownerCnic: string;

  @Prop({ type: String, default: null })
  businessProof: string | null;

  @Prop({ required: true })
  payoutMethod: string;

  @Prop({ required: true })
  merchantAccount: string;

  @Prop({
    type: {
      freeDeliveryOver: { type: String, default: '2000' },
      deliveryFee: { type: String, default: '150' },
      sameDayEnabled: { type: Boolean, default: false },
      sameDayCutoff: { type: String, default: '14:00' },
    },
    default: () => ({
      freeDeliveryOver: '2000',
      deliveryFee: '150',
      sameDayEnabled: false,
      sameDayCutoff: '14:00',
    }),
  })
  delivery: {
    freeDeliveryOver: string;
    deliveryFee: string;
    sameDayEnabled: boolean;
    sameDayCutoff: string;
  };

  @Prop({
    type: {
      openDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
      opens: { type: String, default: '09:00' },
      closes: { type: String, default: '21:00' },
    },
    default: () => ({
      openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      opens: '09:00',
      closes: '21:00',
    }),
  })
  businessHours: {
    openDays: string[];
    opens: string;
    closes: string;
  };

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'approved' | 'rejected';

  @Prop({ type: String, default: null })
  rejectionReason: string | null;

  @Prop({
    type: String,
    enum: ['user', 'store'],
    default: 'store',
  })
  role: string;
}

export const StoreSchema = SchemaFactory.createForClass(Store);

StoreSchema.index({ phone: 1 });
StoreSchema.index({ ownerCnic: 1 });
