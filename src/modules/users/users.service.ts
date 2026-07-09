import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { toUserResponse } from '../../shared/mappers/user.mapper';
import { ReminderResponse, SavedAddress, SavedPaymentMethod, ServiceResponse, UserResponse } from '../../shared/types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { S3Service } from '../../common/storage/s3.service';
import { karachiDateStr } from '../../shared/utils/karachi-time.util';

const REMINDER_WINDOW_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async getProfile(userId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const pets = await this.petModel
      .find({ owner: user._id, isActive: true })
      .lean()
      .exec();

    const profile = toUserResponse(user);
    return {
      data: {
        ...profile,
        pets: pets.map((p) => ({
          id: p._id.toString(),
          name: p.name,
          photo: p.photo,
          species: p.species,
          breed: p.breed,
          dateOfBirth: p.dateOfBirth,
          weight: p.weight,
          gender: p.gender,
          color: p.color,
          allergies: p.allergies,
          currentMedications: p.currentMedications,
          vaccinationStatus: p.vaccinationStatus,
          remindersEnabled: p.remindersEnabled,
          isActive: p.isActive,
        })),
      },
      message: 'Profile fetched',
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    profilePhoto?: Express.Multer.File,
  ): Promise<ServiceResponse<UserResponse>> {
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.gender !== undefined) update.gender = dto.gender;
    if (dto.area !== undefined) update.area = dto.area;
    if (dto.city !== undefined) update.city = dto.city;
    if (dto.language !== undefined) update.language = dto.language;
    if (profilePhoto) update.profilePhoto = await this.s3Service.uploadImage(profilePhoto, 'avatars');

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

  async updateNotifications(userId: string, dto: UpdateNotificationsDto): Promise<ServiceResponse<null>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const prefs = user.notificationPreferences ?? {
      channels: { push: true, whatsapp: true, email: false },
      types: { vaccination: true, appointment: true, order: true, promotions: false },
    };

    if (dto.channels) {
      if (dto.channels.push !== undefined) prefs.channels.push = dto.channels.push;
      if (dto.channels.whatsapp !== undefined) prefs.channels.whatsapp = dto.channels.whatsapp;
      if (dto.channels.email !== undefined) prefs.channels.email = dto.channels.email;
    }

    if (dto.types) {
      if (dto.types.vaccination !== undefined) prefs.types.vaccination = dto.types.vaccination;
      if (dto.types.appointment !== undefined) prefs.types.appointment = dto.types.appointment;
      if (dto.types.order !== undefined) prefs.types.order = dto.types.order;
      if (dto.types.promotions !== undefined) prefs.types.promotions = dto.types.promotions;
    }

    user.notificationPreferences = prefs;
    user.markModified('notificationPreferences');
    await user.save();

    return { data: null, message: 'Notification preferences updated' };
  }

  async getNotifications(userId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const prefs = user.notificationPreferences ?? {
      channels: { push: true, whatsapp: true, email: false },
      types: { vaccination: true, appointment: true, order: true, promotions: false },
    };

    return { data: { channels: prefs.channels, types: prefs.types }, message: 'Notification preferences retrieved' };
  }

  async getReminders(userId: string): Promise<ServiceResponse<ReminderResponse | null>> {
    const todayStr = karachiDateStr();
    const limitStr = karachiDateStr(new Date(Date.now() + REMINDER_WINDOW_DAYS * 86_400_000));

    const pets = await this.petModel
      .find({ owner: new Types.ObjectId(userId), isActive: true, remindersEnabled: true })
      .exec();

    let earliest: ReminderResponse | null = null;

    for (const pet of pets) {
      for (const vax of pet.vaccinations) {
        if (vax.nextDue >= todayStr && vax.nextDue <= limitStr) {
          const daysUntilDue = this.daysBetween(todayStr, vax.nextDue);
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

  // ── Addresses ────────────────────────────────────────────────────────────────

  async getAddresses(userId: string): Promise<ServiceResponse<SavedAddress[]>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    return {
      data: user.addresses.map(this.toAddressResponse),
      message: 'Addresses retrieved',
    };
  }

  async addAddress(userId: string, dto: CreateAddressDto): Promise<ServiceResponse<SavedAddress>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const setAsDefault = dto.isDefault === true || user.addresses.length === 0;

    if (setAsDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
    }

    user.addresses.push({
      label: dto.label,
      street: dto.street,
      area: dto.area,
      city: dto.city ?? 'Lahore',
      isDefault: setAsDefault,
    } as Parameters<typeof user.addresses.push>[0]);

    await user.save();

    const created = user.addresses[user.addresses.length - 1];
    return { data: this.toAddressResponse(created), message: 'Address added' };
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<ServiceResponse<SavedAddress>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const addr = user.addresses.find((a) => a._id.toString() === addressId);
    if (!addr) throw new NotFoundException({ message: 'Address not found', code: 'ADDRESS_NOT_FOUND' });

    if (dto.label !== undefined) addr.label = dto.label;
    if (dto.street !== undefined) addr.street = dto.street;
    if (dto.area !== undefined) addr.area = dto.area;
    if (dto.city !== undefined) addr.city = dto.city;
    if (dto.isDefault === true) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      addr.isDefault = true;
    }

    user.markModified('addresses');
    await user.save();

    return { data: this.toAddressResponse(addr), message: 'Address updated' };
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const idx = user.addresses.findIndex((a) => a._id.toString() === addressId);
    if (idx === -1) throw new NotFoundException({ message: 'Address not found', code: 'ADDRESS_NOT_FOUND' });

    const wasDefault = user.addresses[idx].isDefault;
    user.addresses.splice(idx, 1);

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    user.markModified('addresses');
    await user.save();
  }

  // ── Payment methods ──────────────────────────────────────────────────────────

  async getPaymentMethods(userId: string): Promise<ServiceResponse<SavedPaymentMethod[]>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    return {
      data: user.paymentMethods.map(this.toPaymentMethodResponse),
      message: 'Payment methods retrieved',
    };
  }

  async addPaymentMethod(userId: string, dto: CreatePaymentMethodDto): Promise<ServiceResponse<SavedPaymentMethod>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException({ message: 'User not found', code: 'USER_NOT_FOUND' });

    const setAsDefault = user.paymentMethods.length === 0;

    user.paymentMethods.push({
      provider: dto.provider,
      phoneNumber: dto.phoneNumber,
      isDefault: setAsDefault,
    } as Parameters<typeof user.paymentMethods.push>[0]);

    await user.save();

    const created = user.paymentMethods[user.paymentMethods.length - 1];
    return { data: this.toPaymentMethodResponse(created), message: 'Payment method added' };
  }

  private toPaymentMethodResponse(pm: { _id: Types.ObjectId; provider: string; phoneNumber: string; isDefault: boolean }): SavedPaymentMethod {
    return {
      id: pm._id.toString(),
      provider: pm.provider,
      maskedNumber: UsersService.maskPhoneNumber(pm.phoneNumber),
      isDefault: pm.isDefault,
    };
  }

  private static maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length < 8) return phoneNumber;
    return `${phoneNumber.slice(0, 4)} *** ${phoneNumber.slice(-4)}`;
  }

  private toAddressResponse(addr: { _id: Types.ObjectId; label: string; street: string; area: string; city: string; isDefault: boolean }): SavedAddress {
    return {
      id: addr._id.toString(),
      label: addr.label as SavedAddress['label'],
      street: addr.street,
      area: addr.area,
      city: addr.city,
      isDefault: addr.isDefault,
    };
  }

  // Both args are plain "YYYY-MM-DD" strings — comparing via Date.UTC keeps this
  // independent of the host process's local timezone (see karachi-time.util.ts).
  private daysBetween(fromStr: string, toStr: string): number {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
  }
}
