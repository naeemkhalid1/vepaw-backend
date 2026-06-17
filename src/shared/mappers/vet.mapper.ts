import { Types } from 'mongoose';
import { WorkingHours } from '../../database/schemas/vet.schema';
import {
  EmergencyNearby,
  EmergencyNearest,
  ReviewResponse,
  VetResponse,
  WorkingHoursResponse,
} from '../types';

// Raw vet object from either find().lean() or aggregate()
export interface VetRaw {
  _id: Types.ObjectId;
  name: string;
  clinicName: string;
  photo: string | null;
  email: string;
  phone: string;
  location: { type: string; coordinates: number[] };
  address: string;
  city: string;
  area: string;
  fee: { min: number; max: number };
  specialty: string | null;
  about: string | null;
  yearsExperience: number | null;
  specializations: string[];
  languages: string[];
  workingHours: WorkingHours;
  is24Hours: boolean;
  isEmergency: boolean;
  radiusKm: number | null;
  rating: number;
  reviewCount: number;
  verified: boolean;
  subscriptionStatus: string;
  featured: boolean;
  createdAt: Date;
  distanceKm?: number; // injected by $geoNear
}

export interface ReviewRaw {
  _id: Types.ObjectId;
  vet: Types.ObjectId;
  user: Types.ObjectId;
  pet: Types.ObjectId;
  rating: number;
  comment: string | null;
  petType: string;
  createdAt: Date;
}

export function toVetResponse(raw: VetRaw): VetResponse {
  const coords = raw.location.coordinates;
  return {
    id: raw._id.toString(),
    name: raw.name,
    clinicName: raw.clinicName,
    photo: raw.photo,
    email: raw.email,
    phone: raw.phone,
    location: {
      type: 'Point',
      coordinates: [coords[0], coords[1]],
      ...(raw.distanceKm !== undefined
        ? { distanceKm: Math.round(raw.distanceKm * 100) / 100 }
        : {}),
    },
    address: raw.address,
    city: raw.city,
    area: raw.area,
    fee: raw.fee,
    specialty: raw.specialty,
    about: raw.about,
    yearsExperience: raw.yearsExperience,
    specializations: raw.specializations,
    languages: raw.languages,
    workingHours: raw.workingHours as WorkingHoursResponse,
    is24Hours: raw.is24Hours,
    isEmergency: raw.isEmergency,
    radiusKm: raw.radiusKm,
    rating: raw.rating,
    reviewCount: raw.reviewCount,
    verified: raw.verified,
    subscriptionStatus: raw.subscriptionStatus,
    featured: raw.featured,
    createdAt: raw.createdAt,
  };
}

export function toReviewResponse(raw: ReviewRaw): ReviewResponse {
  return {
    id: raw._id.toString(),
    vet: raw.vet.toString(),
    user: raw.user.toString(),
    pet: raw.pet.toString(),
    rating: raw.rating,
    comment: raw.comment,
    petType: raw.petType,
    createdAt: raw.createdAt,
  };
}

export function toEmergencyNearest(raw: VetRaw): EmergencyNearest {
  const distanceKm = Math.round((raw.distanceKm ?? 0) * 100) / 100;
  return {
    id: raw._id.toString(),
    name: raw.name,
    address: raw.address,
    distanceKm,
    driveMin: Math.round((distanceKm / 30) * 60), // ~30 km/h avg speed in city
    openCount: 0, // filled in by service after full result set is known
    radiusKm: raw.radiusKm,
    phone: raw.phone,
  };
}

export function toEmergencyNearby(raw: VetRaw): EmergencyNearby {
  const distanceKm = Math.round((raw.distanceKm ?? 0) * 100) / 100;
  return {
    id: raw._id.toString(),
    name: raw.name,
    area: raw.area,
    distanceKm,
    etaMin: Math.round((distanceKm / 30) * 60),
    phone: raw.phone,
  };
}
