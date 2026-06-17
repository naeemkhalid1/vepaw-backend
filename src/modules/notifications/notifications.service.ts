import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { ServiceResponse, NotificationResponse } from '../../shared/types';
import { RegisterFcmDto } from './dto/register-fcm.dto';
import { UnregisterFcmDto } from './dto/unregister-fcm.dto';

function toNotificationResponse(
  n: Notification & { _id: Types.ObjectId; createdAt: Date },
): NotificationResponse {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    subtitle: n.subtitle,
    read: n.read,
    targetId: n.targetId,
    createdAt: n.createdAt,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async list(userId: string, page: number, limit: number): Promise<ServiceResponse<NotificationResponse[]>> {
    const filter = { user: new Types.ObjectId(userId) };
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.notificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.notificationModel.countDocuments(filter),
    ]);

    return {
      data: notifications.map((n) => toNotificationResponse(n as Parameters<typeof toNotificationResponse>[0])),
      message: 'Notifications retrieved',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markRead(userId: string, notificationId: string): Promise<ServiceResponse<null>> {
    const n = await this.notificationModel.findOne({
      _id: notificationId,
      user: new Types.ObjectId(userId),
    });
    if (!n) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });

    n.read = true;
    await n.save();

    return { data: null, message: 'Notification marked as read' };
  }

  async markAllRead(userId: string): Promise<ServiceResponse<null>> {
    await this.notificationModel.updateMany(
      { user: new Types.ObjectId(userId), read: false },
      { $set: { read: true } },
    );

    return { data: null, message: 'All notifications marked as read' };
  }

  async registerFcm(userId: string, dto: RegisterFcmDto): Promise<ServiceResponse<null>> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { fcmToken: dto.fcmToken } },
    );

    return { data: null, message: 'FCM token registered' };
  }

  async unregisterFcm(userId: string, dto: UnregisterFcmDto): Promise<ServiceResponse<null>> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId), fcmToken: dto.fcmToken },
      { $set: { fcmToken: null } },
    );

    return { data: null, message: 'FCM token unregistered' };
  }
}
