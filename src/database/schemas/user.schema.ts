import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

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
}

export const UserSchema = SchemaFactory.createForClass(User);
