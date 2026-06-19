import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VisitNoteDocument = HydratedDocument<VisitNote> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class VisitNote {
  @Prop({ type: Types.ObjectId, ref: 'Pet', required: true, index: true })
  pet: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vet', required: true })
  vet: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  notes: string;

  @Prop({ required: true })
  recordedBy: string;
}

export const VisitNoteSchema = SchemaFactory.createForClass(VisitNote);

VisitNoteSchema.index({ pet: 1, createdAt: -1 });
