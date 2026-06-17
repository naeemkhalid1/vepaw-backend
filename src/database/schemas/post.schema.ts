import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PostDocument = HydratedDocument<Post> & { createdAt: Date; updatedAt: Date };

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: true })
  authorName: string;

  @Prop({ type: String, default: null })
  petName: string | null;

  @Prop({ required: true })
  text: string;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: [String], required: true })
  topics: string[];

  @Prop({ type: String, default: null })
  location: string | null;

  @Prop({ type: String, default: null })
  feeling: string | null;

  @Prop({ default: 0, min: 0 })
  likes: number;

  @Prop({ default: 0, min: 0 })
  comments: number;

  @Prop({ default: false })
  isStory: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });
