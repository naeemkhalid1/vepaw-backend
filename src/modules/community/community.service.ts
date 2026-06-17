import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from '../../database/schemas/post.schema';
import { Comment, CommentDocument } from '../../database/schemas/comment.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { ServiceResponse, PostResponse, CommentResponse } from '../../shared/types';
import { CreatePostDto } from './dto/create-post.dto';

function toPostResponse(p: Post & { _id: Types.ObjectId; createdAt: Date }): PostResponse {
  return {
    id: p._id.toString(),
    author: (p.author as Types.ObjectId).toString(),
    authorName: p.authorName,
    petName: p.petName,
    text: p.text,
    imageUrl: p.imageUrl,
    topics: p.topics,
    location: p.location,
    feeling: p.feeling,
    likes: p.likes,
    comments: p.comments,
    isStory: p.isStory,
    createdAt: p.createdAt,
  };
}

function toCommentResponse(c: Comment & { _id: Types.ObjectId; createdAt: Date }): CommentResponse {
  return {
    id: c._id.toString(),
    postId: (c.postId as Types.ObjectId).toString(),
    author: (c.author as Types.ObjectId).toString(),
    authorName: c.authorName,
    isVet: c.isVet,
    text: c.text,
    likes: c.likes,
    createdAt: c.createdAt,
  };
}

@Injectable()
export class CommunityService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getFeed(
    page: number,
    limit: number,
  ): Promise<{ data: { stories: PostResponse[]; posts: PostResponse[] }; message: string; pagination: object }> {
    const skip = (page - 1) * limit;

    const [all, total] = await Promise.all([
      this.postModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.postModel.countDocuments(),
    ]);

    const stories = all
      .filter((p) => p.isStory)
      .map((p) => toPostResponse(p as Parameters<typeof toPostResponse>[0]));
    const posts = all
      .filter((p) => !p.isStory)
      .map((p) => toPostResponse(p as Parameters<typeof toPostResponse>[0]));

    return {
      data: { stories, posts },
      message: 'Feed retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createPost(userId: string, dto: CreatePostDto): Promise<ServiceResponse<PostResponse>> {
    const user = await this.userModel.findById(userId).select('name').lean();
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const post = await this.postModel.create({
      author: new Types.ObjectId(userId),
      authorName: user.name,
      text: dto.text,
      topics: dto.topics,
      imageUrl: dto.imageUrl ?? null,
      petName: dto.petName ?? null,
      location: dto.location ?? null,
      feeling: dto.feeling ?? null,
    });

    return {
      data: toPostResponse(post.toObject() as Parameters<typeof toPostResponse>[0]),
      message: 'Post created',
    };
  }

  async getPost(postId: string): Promise<ServiceResponse<PostResponse>> {
    const post = await this.postModel.findById(postId).lean();
    if (!post) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });

    return {
      data: toPostResponse(post as Parameters<typeof toPostResponse>[0]),
      message: 'Post retrieved',
    };
  }

  async getComments(
    postId: string,
    page: number,
    limit: number,
  ): Promise<ServiceResponse<CommentResponse[]>> {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.commentModel.find({ postId: new Types.ObjectId(postId) }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.commentModel.countDocuments({ postId: new Types.ObjectId(postId) }),
    ]);

    return {
      data: comments.map((c) => toCommentResponse(c as Parameters<typeof toCommentResponse>[0])),
      message: 'Comments retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStory(storyId: string): Promise<ServiceResponse<PostResponse>> {
    const story = await this.postModel.findOne({ _id: storyId, isStory: true }).lean();
    if (!story) throw new NotFoundException({ code: 'STORY_NOT_FOUND', message: 'Story not found' });

    return {
      data: toPostResponse(story as Parameters<typeof toPostResponse>[0]),
      message: 'Story retrieved',
    };
  }
}
