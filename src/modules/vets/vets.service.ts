import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import {
  AppointmentReservation,
  AppointmentReservationDocument,
} from '../../database/schemas/appointment-reservation.schema';
import { TimeOff, TimeOffDocument } from '../../database/schemas/time-off.schema';
import { BlockedSlot, BlockedSlotDocument } from '../../database/schemas/blocked-slot.schema';
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
import { karachiDateStr, karachiTimeStr } from '../../shared/utils/karachi-time.util';
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
    @InjectModel(AppointmentReservation.name)
    private readonly reservationModel: Model<AppointmentReservationDocument>,
    @InjectModel(TimeOff.name) private readonly timeOffModel: Model<TimeOffDocument>,
    @InjectModel(BlockedSlot.name) private readonly blockedSlotModel: Model<BlockedSlotDocument>,
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
      const sort = dto.sort ?? 'nearest';
      const geoNear: PipelineStage = {
        $geoNear: {
          near: { type: 'Point' as const, coordinates: [dto.lng, dto.lat] as [number, number] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001,
          spherical: true,
          query: baseFilter,
        },
      };
      // $geoNear already outputs documents nearest-first — for 'nearest' that ordering is left
      // untouched rather than re-sorted. Previously this always re-sorted by featured/rating
      // regardless of what the caller asked for, silently discarding distance even though it
      // was computed into distanceKm — a "near me" search never actually prioritized nearby
      // vets. 'rating'/'featured' are now an explicit, opt-in override instead of the only path.
      const sortStages: PipelineStage[] =
        sort === 'rating'
          ? [{ $sort: { rating: -1 } }]
          : sort === 'featured'
            ? [{ $sort: { featured: -1, rating: -1 } }]
            : [];

      const [items, countResult] = await Promise.all([
        this.vetModel.aggregate<VetRaw>([
          geoNear,
          ...sortStages,
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

    // No coordinates — 'nearest' isn't meaningful without them, falls back to 'featured'
    // ordering (the same as the default) rather than erroring, since a client might reasonably
    // send sort=nearest speculatively before it has a location fix yet.
    const sortSpec: Record<string, 1 | -1> =
      dto.sort === 'rating' ? { rating: -1 } : { featured: -1, rating: -1 };

    const [items, total] = await Promise.all([
      this.vetModel
        .find(baseFilter)
        .sort(sortSpec)
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

  async getVet(vetId: string, userId?: string): Promise<ServiceResponse<VetResponse>> {
    if (!Types.ObjectId.isValid(vetId)) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const vet = await this.vetModel.findById(vetId).lean<VetRaw>();
    if (!vet) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }

    const canStartConsultation = userId
      ? await this.appointmentModel.exists({
          vet: new Types.ObjectId(vetId),
          owner: new Types.ObjectId(userId),
          status: 'completed',
        }).then(Boolean)
      : false;

    return {
      data: { ...toVetResponse(vet), canStartConsultation },
      message: 'Vet fetched',
    };
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

    const slotDuration = parseInt(vet.slotLength ?? '30', 10) || 30;

    let rawSlots: string[];
    if (vet.is24Hours) {
      rawSlots = this.generateSlots('00:00', '23:30', slotDuration);
    } else if (!daySchedule.isOpen) {
      return { data: [], message: 'Vet is closed on this day' };
    } else {
      rawSlots = this.generateSlots(daySchedule.open, daySchedule.close, slotDuration);
    }

    const todayStr = karachiDateStr();
    let slots = rawSlots;
    if (dto.date === todayStr) {
      const [nowH, nowM] = karachiTimeStr().split(':').map(Number);
      const nowMinutes = nowH * 60 + nowM;
      slots = rawSlots.filter((s) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m > nowMinutes;
      });
    }

    const timeOff = await this.timeOffModel
      .findOne({ vet: new Types.ObjectId(vetId), date: dto.date })
      .lean()
      .exec();

    if (timeOff) {
      return { data: [], message: 'Vet is off on this day' };
    }

    const [booked, blockedSlots, reserved] = await Promise.all([
      this.appointmentModel
        .find({
          vet: new Types.ObjectId(vetId),
          date: dto.date,
          status: { $in: ['pending', 'confirmed'] },
        })
        .select('timeSlot')
        .lean<{ timeSlot: string }[]>(),
      this.blockedSlotModel
        .find({ vet: new Types.ObjectId(vetId), date: dto.date })
        .lean()
        .exec(),
      // Safepay reservations mid-checkout soft-lock a slot too, even though no real
      // Appointment exists yet — otherwise a second browser would see it as bookable.
      this.reservationModel
        .find({
          vet: new Types.ObjectId(vetId),
          date: dto.date,
          expiresAt: { $gt: new Date() },
        })
        .select('timeSlot')
        .lean<{ timeSlot: string }[]>(),
    ]);

    const bookedSet = new Set([...booked, ...reserved].map((a) => a.timeSlot));
    const blockedSet = new Set(blockedSlots.map((b) => b.time));

    return {
      data: slots.map((time) => ({
        time,
        status: blockedSet.has(time) || bookedSet.has(time) ? 'booked' : 'available',
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

  private generateSlots(open: string, close: string, duration = 30): string[] {
    const [openH, openM] = open.split(':').map(Number);
    const [closeH, closeM] = close.split(':').map(Number);
    const closeMinutes = closeH * 60 + closeM;

    const slots: string[] = [];
    let h = openH;
    let m = openM;

    while (h * 60 + m < closeMinutes) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += duration;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
      }
    }

    return slots;
  }
}
