import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InviteDocument = HydratedDocument<Invite> & {
  createdAt: Date;
};

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Invite {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true, enum: ['vet', 'store'] })
  entityType: 'vet' | 'store';

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  entityName: string;

  @Prop({ type: String, default: null })
  entityArea: string | null;

  @Prop({ required: true })
  inviterName: string;

  @Prop({ required: true })
  inviteeName: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'expired'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'accepted' | 'expired';

  @Prop({ required: true })
  expiresAt: Date;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);

InviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
InviteSchema.index({ entityId: 1, entityType: 1 });
