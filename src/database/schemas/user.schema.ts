import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: true })
class AddressEntry {
  @Prop({ type: String, enum: ['Home', 'Work', 'Other'], required: true })
  label: 'Home' | 'Work' | 'Other';

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  area: string;

  @Prop({ default: 'Lahore' })
  city: string;

  @Prop({ default: false })
  isDefault: boolean;
}

const AddressEntrySchema = SchemaFactory.createForClass(AddressEntry);

export type AddressSubdoc = AddressEntry & { _id: Types.ObjectId };

export type UserDocument = HydratedDocument<User> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true, trim: true })
  phone: string;

  @Prop({ trim: true, default: '' })
  name: string;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, default: null, select: false })
  password: string | null;

  @Prop({ type: String, enum: ['male', 'female', 'other'], default: null })
  gender: 'male' | 'female' | 'other' | null;

  @Prop({ type: String, default: null })
  profilePhoto: string | null;

  @Prop({ default: 'Lahore' })
  city: string;

  @Prop({ default: '' })
  area: string;

  @Prop({ type: String, default: null })
  fcmToken: string | null;

  @Prop({ type: String, enum: ['en', 'ur'], default: 'en' })
  language: 'en' | 'ur';

  @Prop({ type: String, enum: ['user', 'admin'], default: 'user', index: true })
  role: 'user' | 'admin';

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Pet' }], default: [] })
  pets: Types.ObjectId[];

  @Prop({ type: [AddressEntrySchema], default: [] })
  addresses: AddressSubdoc[];

  @Prop({
    type: {
      locationEnabled: { type: Boolean, default: true },
      showReviews: { type: Boolean, default: true },
      personalised: { type: Boolean, default: true },
    },
    default: () => ({ locationEnabled: true, showReviews: true, personalised: true }),
  })
  privacy: {
    locationEnabled: boolean;
    showReviews: boolean;
    personalised: boolean;
  };

  @Prop({
    type: {
      channels: {
        type: {
          push: { type: Boolean, default: true },
          whatsapp: { type: Boolean, default: true },
          email: { type: Boolean, default: false },
        },
        default: () => ({ push: true, whatsapp: true, email: false }),
      },
      types: {
        type: {
          vaccination: { type: Boolean, default: true },
          appointment: { type: Boolean, default: true },
          order: { type: Boolean, default: true },
          promotions: { type: Boolean, default: false },
        },
        default: () => ({ vaccination: true, appointment: true, order: true, promotions: false }),
      },
    },
    default: () => ({
      channels: { push: true, whatsapp: true, email: false },
      types: { vaccination: true, appointment: true, order: true, promotions: false },
    }),
  })
  notificationPreferences: {
    channels: { push: boolean; whatsapp: boolean; email: boolean };
    types: { vaccination: boolean; appointment: boolean; order: boolean; promotions: boolean };
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
