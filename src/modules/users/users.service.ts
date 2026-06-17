import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { toUserResponse } from '../../shared/mappers/user.mapper';
import { ReminderResponse, ServiceResponse, UserResponse } from '../../shared/types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';

const REMINDER_WINDOW_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
  ) {}

  async getProfile(userId: string): Promise<ServiceResponse<UserResponse>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    return { data: toUserResponse(user), message: 'Profile fetched' };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ServiceResponse<UserResponse>> {
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.gender !== undefined) update.gender = dto.gender;
    if (dto.area !== undefined) update.area = dto.area;
    if (dto.profilePhoto !== undefined) update.profilePhoto = dto.profilePhoto;
    if (dto.language !== undefined) update.language = dto.language;

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true })
      .exec();

    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    return { data: toUserResponse(user), message: 'Profile updated' };
  }

  async updateFcmToken(
    userId: string,
    dto: UpdateFcmTokenDto,
  ): Promise<ServiceResponse<null>> {
    await this.userModel
      .updateOne({ _id: new Types.ObjectId(userId) }, { $set: { fcmToken: dto.fcmToken } })
      .exec();
    return { data: null, message: 'FCM token updated' };
  }

  async updatePrivacy(
    userId: string,
    dto: UpdatePrivacyDto,
  ): Promise<ServiceResponse<null>> {
    const update: Record<string, boolean> = {};
    if (dto.locationEnabled !== undefined) update['privacy.locationEnabled'] = dto.locationEnabled;
    if (dto.showReviews !== undefined) update['privacy.showReviews'] = dto.showReviews;
    if (dto.personalised !== undefined) update['privacy.personalised'] = dto.personalised;

    if (Object.keys(update).length > 0) {
      await this.userModel
        .updateOne({ _id: new Types.ObjectId(userId) }, { $set: update })
        .exec();
    }

    return { data: null, message: 'Privacy settings updated' };
  }

  async getReminders(userId: string): Promise<ServiceResponse<ReminderResponse | null>> {
    const today = new Date();
    const todayStr = this.toDateStr(today);

    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + REMINDER_WINDOW_DAYS);
    const limitStr = this.toDateStr(limitDate);

    const pets = await this.petModel
      .find({ owner: new Types.ObjectId(userId), isActive: true, remindersEnabled: true })
      .exec();

    let earliest: ReminderResponse | null = null;

    for (const pet of pets) {
      for (const vax of pet.vaccinations) {
        if (vax.nextDue >= todayStr && vax.nextDue <= limitStr) {
          const daysUntilDue = this.daysBetween(today, new Date(vax.nextDue));
          if (!earliest || daysUntilDue < earliest.daysUntilDue) {
            earliest = {
              petId: pet._id.toString(),
              petName: pet.name,
              vaccineName: vax.name,
              daysUntilDue,
              suggestedClinic: null,
            };
          }
        }
      }
    }

    return { data: earliest, message: earliest ? 'Reminder found' : 'No upcoming reminders' };
  }

  private toDateStr(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private daysBetween(from: Date, to: Date): number {
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.ceil((toDay.getTime() - fromDay.getTime()) / 86_400_000);
  }
}
