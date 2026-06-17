import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { toAppointmentResponse } from '../../shared/mappers/appointment.mapper';
import { toReviewResponse, ReviewRaw } from '../../shared/mappers/vet.mapper';
import { AppointmentResponse, ReviewResponse, ServiceResponse } from '../../shared/types';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

// Configurable platform commission — move to ConfigService when fee tiers are introduced
const PLATFORM_COMMISSION_PKR = 150;

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
  ) {}

  async createAppointment(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    if (!Types.ObjectId.isValid(dto.vetId) || !Types.ObjectId.isValid(dto.petId)) {
      throw new NotFoundException({ message: 'Vet or pet not found', code: 'NOT_FOUND' });
    }

    const [vet, pet] = await Promise.all([
      this.vetModel.findOne({ _id: dto.vetId, verified: true, subscriptionStatus: 'active' }),
      this.petModel.findOne({
        _id: dto.petId,
        owner: new Types.ObjectId(userId),
        isActive: true,
      }),
    ]);

    if (!vet) {
      throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    }
    if (!pet) {
      throw new NotFoundException({ message: 'Pet not found', code: 'PET_NOT_FOUND' });
    }

    if (dto.fee < vet.fee.min || dto.fee > vet.fee.max) {
      throw new HttpException(
        {
          message: `Fee must be between ${vet.fee.min} and ${vet.fee.max} PKR`,
          code: 'INVALID_FEE',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const slotTaken = await this.appointmentModel.exists({
      vet: dto.vetId,
      date: dto.date,
      timeSlot: dto.timeSlot,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (slotTaken) {
      throw new UnprocessableEntityException({
        message: 'This time slot is no longer available',
        code: 'SLOT_UNAVAILABLE',
      });
    }

    const fee = dto.fee;
    const platformCommission = PLATFORM_COMMISSION_PKR;
    const vetPayout = fee - platformCommission;

    const appointment = await this.appointmentModel.create({
      pet: new Types.ObjectId(dto.petId),
      vet: new Types.ObjectId(dto.vetId),
      owner: new Types.ObjectId(userId),
      date: dto.date,
      timeSlot: dto.timeSlot,
      paymentMethod: dto.paymentMethod,
      fee,
      platformCommission,
      vetPayout,
      vetDetails: {
        name: vet.name,
        clinicName: vet.clinicName,
        address: vet.address,
        phone: vet.phone,
      },
      petDetails: {
        name: pet.name,
        species: pet.species,
      },
    });

    return { data: toAppointmentResponse(appointment), message: 'Appointment created' };
  }

  async listAppointments(
    userId: string,
    dto: ListAppointmentsDto,
  ): Promise<ServiceResponse<AppointmentResponse[]>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { owner: new Types.ObjectId(userId) };
    if (dto.status) filter.status = dto.status;

    const [items, total] = await Promise.all([
      this.appointmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.appointmentModel.countDocuments(filter),
    ]);

    return {
      data: items.map(toAppointmentResponse),
      message: 'Appointments fetched',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);
    return { data: toAppointmentResponse(appointment), message: 'Appointment fetched' };
  }

  async completeAppointment(
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    if (!Types.ObjectId.isValid(appointmentId)) {
      throw new NotFoundException({
        message: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND',
      });
    }

    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException({
        message: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND',
      });
    }

    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new UnprocessableEntityException({
        message: 'Only pending or confirmed appointments can be marked complete',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    appointment.status = 'completed';
    appointment.paymentStatus = 'released';
    await appointment.save();

    return { data: toAppointmentResponse(appointment), message: 'Appointment marked complete' };
  }

  async cancelAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);

    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new UnprocessableEntityException({
        message: 'Only pending or confirmed appointments can be cancelled',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    appointment.status = 'cancelled';
    if (appointment.paymentStatus === 'held') {
      appointment.paymentStatus = 'refunded';
    }
    await appointment.save();

    return { data: toAppointmentResponse(appointment), message: 'Appointment cancelled' };
  }

  async submitReview(
    userId: string,
    appointmentId: string,
    dto: SubmitReviewDto,
  ): Promise<ServiceResponse<ReviewResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);

    if (appointment.status !== 'completed') {
      throw new UnprocessableEntityException({
        message: 'You can only review completed appointments',
        code: 'APPOINTMENT_NOT_COMPLETED',
      });
    }

    if (appointment.reviewId) {
      throw new ConflictException({
        message: 'You have already reviewed this appointment',
        code: 'REVIEW_ALREADY_EXISTS',
      });
    }

    let review: ReviewDocument;
    try {
      review = await this.reviewModel.create({
        vet: appointment.vet,
        user: new Types.ObjectId(userId),
        pet: appointment.pet,
        appointment: appointment._id,
        rating: dto.rating,
        comment: dto.comment ?? null,
        petType: appointment.petDetails.species,
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException({
          message: 'You have already reviewed this appointment',
          code: 'REVIEW_ALREADY_EXISTS',
        });
      }
      throw err;
    }

    appointment.reviewId = review._id as Types.ObjectId;
    await appointment.save();

    await this.updateVetRating(appointment.vet.toString(), dto.rating);

    return {
      data: toReviewResponse(review as unknown as ReviewRaw),
      message: 'Review submitted',
    };
  }

  private async updateVetRating(vetId: string, newRating: number): Promise<void> {
    const vet = await this.vetModel
      .findById(vetId)
      .select('rating reviewCount')
      .lean<{ rating: number; reviewCount: number }>();
    if (!vet) return;

    const newCount = vet.reviewCount + 1;
    const newAvg = Math.round(((vet.rating * vet.reviewCount) + newRating) / newCount * 10) / 10;

    await this.vetModel.updateOne(
      { _id: vetId },
      { $set: { rating: newAvg, reviewCount: newCount } },
    );
  }

  private async findOwnedAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentDocument> {
    if (!Types.ObjectId.isValid(appointmentId)) {
      throw new NotFoundException({
        message: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND',
      });
    }

    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException({
        message: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND',
      });
    }

    if (appointment.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'Not authorized', code: 'FORBIDDEN' });
    }

    return appointment;
  }
}
