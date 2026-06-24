import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BlockedSlotDocument = HydratedDocument<BlockedSlot>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class BlockedSlot {
  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true, index: true })
  vet: Types.ObjectId;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  slotId: string;

  @Prop({ required: true })
  time: string;
}

export const BlockedSlotSchema = SchemaFactory.createForClass(BlockedSlot);

BlockedSlotSchema.index({ vet: 1, date: 1 });
BlockedSlotSchema.index({ vet: 1, slotId: 1, date: 1 }, { unique: true });
