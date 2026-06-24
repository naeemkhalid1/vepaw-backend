import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PasswordTokenDocument = HydratedDocument<PasswordToken>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PasswordToken {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['vet', 'store'] })
  entityType: 'vet' | 'store';

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true, enum: ['vet_admin', 'store_owner'] })
  role: string;

  @Prop({ default: false })
  used: boolean;

  @Prop({ required: true })
  expiresAt: Date;
}

export const PasswordTokenSchema = SchemaFactory.createForClass(PasswordToken);

PasswordTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
