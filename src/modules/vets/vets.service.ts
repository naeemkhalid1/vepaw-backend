import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import {
  toEmergencyNearest,
  toEmergencyNearby,
  toReviewResponse,
  toVetResponse,
  VetRaw,
  ReviewRaw,
} from '../../shared/mappers/vet.mapper';
import {
  EmergencyResponse,
  ReviewResponse,
  ServiceResponse,
  SlotResponse,
  VetResponse,
} from '../../shared/types';
import { ListVetsDto } from './dto/list-vets.dto';
import { NearbyVetsDto } from './dto/nearby-vets.dto';
import { EmergencyVetsDto } from './dto/emergency-vets.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

const EMERGENCY_RADIUS_METERS = 15_000;
const VISIBILITY_FILTER = { verified: true, subscriptionStatus: 'active' } as const;

@Injectable()
export class VetsService {
  constructor(
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
  ) {}

  async listVets(dto: ListVetsDto): Promise<ServiceResponse<VetResponse[]>> {
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException('lat and lng must both be provided or both omitted');
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const baseFilter: Record<string, unknown> = { ...VISIBILITY_FILTER };
    if (dto.q) {
      const regex = new RegExp(dto.q, 'i');
      baseFilter.$or = [{ name: regex }, { clinicName: regex }];
    }
    if (dto.area) baseFilter.area = new RegExp(dto.area, 'i');
    if (dto.specialization) baseFilter.specializations = dto.specialization;
    if (dto.maxFee) baseFilter['fee.min'] = { $lte: dto.maxFee };

    if (dto.lat !== undefined && dto.lng !== undefined) {
      const geoNear: PipelineStage = {
        $geoNear: {
          near: { type: 'Point' as const, coordinates: [dto.lng, dto.lat] as [number, number] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001,
          spherical: true,
          query: baseFilter,
        },
      };
      const [items, countResult] = await Promise.all([
        this.vetModel.aggregate<VetRaw>([
          geoNear,
          { $sort: { featured: -1, rating: -1 } },
          { $skip: skip },
          { $limit: limit },
        ]),
        this.vetModel.aggregate<{ total: number }>([geoNear, { $count: 'total' }]),
      ]);
      const total = countResult[0]?.total ?? 0;
      return {
        data: items.map(toVetResponse),
        message: 'Vets fetched',
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    const [items, total] = await Promise.all([
      this.vetModel
        .find(baseFilter)
        .sort({ featured: -1, rating: -1 })
        .skip(skip)
        .limit(limit)
        .lean<VetRaw[]>(),
      this.vetModel.countDocuments(baseFilter),
    ]);

    return {
      data: items.map(toVetResponse),
      message: 'Vets fetched',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async nearbyVets(dto: NearbyVetsDto): Promise<ServiceResponse<VetResponse[]>> {
    const limit = dto.limit ?? 5;
    const items = await this.vetModel.aggregate<VetRaw>([
      {
        $geoNear: {
          near: { type: 'Point' as const, coordinates: [dto.lng, dto.lat] as [number, number] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001,
          spherical: true,
          query: { ...VISIBILITY_FILTER },
        },
      } as PipelineStage,
      { $limit: limit },
    ]);
    return { data: items.map(toVetResponse), message: 'Nearby vets fetched' };
  }

  async emergencyVets(dto: EmergencyVetsDto): Promise<ServiceResponse<EmergencyResponse>> {
    const results = await this.vetModel.aggregate<VetRaw>([
      {
        $geoNear: {
          near: { type: 'Point' as const, coordinates: [dto.lng, dto.lat] as [number, number] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001,
          maxDistance: EMERGENCY_RADIUS_METERS,
          spherical: true,
          query: { ...VISIBILITY_FILTER, isEmergency: true },
        },
      } as PipelineStage,
    ]);

    if (results.length === 0) {
      return { data: { nearest: null, nearby: [] }, message: 'No emergency vets nearby' };
    }

    const [first, ...rest] = results;
    const nearest = toEmergencyNearest(first);
    nearest.openCount = results.length;

    return {
      data: { nearest, nearby: rest.map(toEmergencyNearby) },
      message: 'Emergency vets fetched',
    };
  }

  async getVet(vetId: string): Promise<ServiceResponse<VetResponse>> {
    if (!Types.ObjectId.isValid(vetId)) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const vet = await this.vetModel.findById(vetId).lean<VetRaw>();
    if (!vet) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    return { data: toVetResponse(vet), message: 'Vet fetched' };
  }

  async getAvailability(
    vetId: string,
    dto: GetAvailabilityDto,
  ): Promise<ServiceResponse<SlotResponse[]>> {
    if (!Types.ObjectId.isValid(vetId)) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const vet = await this.vetModel
      .findOne({ _id: vetId, ...VISIBILITY_FILTER })
      .lean<VetRaw>();
    if (!vet) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    type DayKey = (typeof dayNames)[number];
    const dayKey = dayNames[new Date(dto.date).getDay()] as DayKey;
    const daySchedule = vet.workingHours[dayKey];

    let rawSlots: string[];
    if (vet.is24Hours) {
      rawSlots = this.generateSlots('00:00', '23:30');
    } else if (!daySchedule.isOpen) {
      return { data: [], message: 'Vet is closed on this day' };
    } else {
      rawSlots = this.generateSlots(daySchedule.open, daySchedule.close);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let slots = rawSlots;
    if (dto.date === todayStr) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      slots = rawSlots.filter((s) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m > nowMinutes;
      });
    }

    const booked = await this.appointmentModel
      .find({ vet: vetId, date: dto.date, status: { $in: ['pending', 'confirmed'] } })
      .select('timeSlot')
      .lean<{ timeSlot: string }[]>();

    const bookedSet = new Set(booked.map((a) => a.timeSlot));

    return {
      data: slots.map((time) => ({
        time,
        status: bookedSet.has(time) ? 'booked' : 'available',
      })),
      message: 'Availability fetched',
    };
  }

  async getReviews(
    vetId: string,
    dto: ListReviewsDto,
  ): Promise<ServiceResponse<ReviewResponse[]>> {
    if (!Types.ObjectId.isValid(vetId)) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter = { vet: new Types.ObjectId(vetId) };
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ReviewRaw[]>(),
      this.reviewModel.countDocuments(filter),
    ]);

    return {
      data: items.map(toReviewResponse),
      message: 'Reviews fetched',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private generateSlots(open: string, close: string): string[] {
    const [openH, openM] = open.split(':').map(Number);
    const [closeH, closeM] = close.split(':').map(Number);
    const closeMinutes = closeH * 60 + closeM;

    const slots: string[] = [];
    let h = openH;
    let m = openM;

    while (h * 60 + m < closeMinutes) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 30;
      if (m >= 60) {
        h += 1;
        m -= 60;
      }
    }

    return slots;
  }
}
