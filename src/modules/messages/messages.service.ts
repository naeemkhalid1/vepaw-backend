import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../database/schemas/message.schema';
import { ServiceResponse, ThreadResponse, MessageResponse } from '../../shared/types';

function toThreadResponse(t: Thread & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }): ThreadResponse {
  return {
    id: t._id.toString(),
    type: t.type,
    name: t.name,
    preview: t.preview,
    unread: t.unread,
    verified: t.verified,
    vetId: t.vetId ? (t.vetId as Types.ObjectId).toString() : null,
    orderId: t.orderId ? (t.orderId as Types.ObjectId).toString() : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function toMessageResponse(m: Message & { _id: Types.ObjectId; createdAt: Date }): MessageResponse {
  return {
    id: m._id.toString(),
    thread: (m.thread as Types.ObjectId).toString(),
    type: m.type,
    sender: m.sender,
    text: m.text,
    product: m.product ?? null,
    createdAt: m.createdAt,
  };
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
  ) {}

  async getThreads(userId: string): Promise<ServiceResponse<ThreadResponse[]>> {
    const threads = await this.threadModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();

    return {
      data: threads.map((t) => toThreadResponse(t as Parameters<typeof toThreadResponse>[0])),
      message: 'Threads retrieved',
    };
  }

  async getVetMessages(userId: string, vetId: string): Promise<ServiceResponse<MessageResponse[]>> {
    const thread = await this.threadModel.findOne({
      user: new Types.ObjectId(userId),
      vetId: new Types.ObjectId(vetId),
      type: 'vet',
    }).lean();

    if (!thread) {
      return { data: [], message: 'No messages yet' };
    }

    const messages = await this.messageModel
      .find({ thread: thread._id })
      .sort({ createdAt: 1 })
      .lean();

    return {
      data: messages.map((m) => toMessageResponse(m as Parameters<typeof toMessageResponse>[0])),
      message: 'Messages retrieved',
    };
  }
}
