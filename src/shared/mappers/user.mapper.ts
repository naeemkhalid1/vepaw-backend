import { UserDocument } from '../../database/schemas/user.schema';
import { UserResponse } from '../types';

export function toUserResponse(user: UserDocument): UserResponse {
  return {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    email: user.email,
    gender: user.gender,
    profilePhoto: user.profilePhoto,
    city: user.city,
    area: user.area,
    fcmToken: user.fcmToken,
    language: user.language,
    pets: user.pets.map((p) => p.toString()),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
