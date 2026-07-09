import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { Clinic, ClinicDocument } from '../../database/schemas/clinic.schema';
import { toAppointmentResponse } from '../../shared/mappers/appointment.mapper';
import { toReviewResponse, ReviewRaw } from '../../shared/mappers/vet.mapper';
import { AppointmentResponse, ReviewResponse, ServiceResponse } from '../../shared/types';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { karachiDateStr, karachiDateTimeToUTC } from '../../shared/utils/karachi-time.util';
import { S3Service } from '../../common/storage/s3.service';

// Configurable platform commission — move to ConfigService when fee tiers are introduced
const PLATFORM_COMMISSION_PKR = 150;

// How long past the scheduled time an unresolved appointment is treated as a no-show
const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
    private readonly s3Service: S3Service,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async markStaleAppointmentsNoShow(): Promise<void> {
    const now = new Date();
    const todayStr = karachiDateStr(now);

    const pastDayResult = await this.appointmentModel.updateMany(
      { status: { $in: ['pending', 'confirmed'] }, date: { $lt: todayStr } },
      { $set: { status: 'no-show' } },
    );

    const todaysAppointments = await this.appointmentModel
      .find({ status: { $in: ['pending', 'confirmed'] }, date: todayStr })
      .lean()
      .exec();

    const staleTodayIds = todaysAppointments
      .filter((a) => karachiDateTimeToUTC(a.date, a.timeSlot).getTime() < now.getTime() - NO_SHOW_GRACE_MS)
      .map((a) => a._id);

    if (staleTodayIds.length > 0) {
      await this.appointmentModel.updateMany(
        { _id: { $in: staleTodayIds } },
        { $set: { status: 'no-show' } },
      );
    }

    const total = pastDayResult.modifiedCount + staleTodayIds.length;
    if (total > 0) {
      this.logger.log(`Marked ${total} stale appointment(s) as no-show`);
    }
  }

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

    return { data: await this.toResponse(appointment), message: 'Appointment created' };
  }

  async submitPayment(
    userId: string,
    appointmentId: string,
    proof: Express.Multer.File,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    if (!Types.ObjectId.isValid(appointmentId)) {
      throw new NotFoundException({ message: 'Appointment not found', code: 'APPOINTMENT_NOT_FOUND' });
    }

    // Ownership-scoped lookup collapses "doesn't exist" and "not yours" into one 404,
    // mirroring /consultations/:id/submit-payment's contract rather than this file's
    // findOwnedAppointment (404-vs-403 split) used elsewhere.
    const appointment = await this.appointmentModel
      .findOne({ _id: appointmentId, owner: new Types.ObjectId(userId) })
      .exec();
    if (!appointment) {
      throw new NotFoundException({ message: 'Appointment not found', code: 'APPOINTMENT_NOT_FOUND' });
    }

    if (appointment.paymentMethod === 'cod') {
      throw new BadRequestException({
        message: 'Cash-on-delivery appointments do not require payment proof',
        code: 'PROOF_NOT_APPLICABLE',
      });
    }
    if (appointment.paymentStatus !== 'pending') {
      throw new BadRequestException({
        message: 'Payment proof can only be submitted while payment is pending',
        code: 'INVALID_STATUS',
      });
    }

    const proofKey = await this.s3Service.uploadPrivateImage(proof, 'appointment-payments');
    appointment.paymentProofUrl = proofKey;
    appointment.paymentSubmittedAt = new Date();
    appointment.paymentStatus = 'proof_submitted';
    await appointment.save();

    return { data: await this.toResponse(appointment), message: 'Payment proof submitted' };
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
      data: await this.toResponseList(items),
      message: 'Appointments fetched',
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);
    return { data: await this.toResponse(appointment), message: 'Appointment fetched' };
  }

  async verifyAppointmentPayment(
    vetId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findVetAppointment(vetId, appointmentId);

    if (appointment.paymentStatus !== 'proof_submitted') {
      throw new UnprocessableEntityException({
        message: 'Only an appointment with submitted payment proof can be verified',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    appointment.paymentStatus = 'held';
    appointment.status = 'confirmed';
    await appointment.save();

    return { data: await this.toResponse(appointment), message: 'Payment verified — appointment confirmed' };
  }

  async completeAppointment(
    vetId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findVetAppointment(vetId, appointmentId);

    if (!['pending', 'confirmed', 'in-progress'].includes(appointment.status)) {
      throw new UnprocessableEntityException({
        message: 'Only pending, confirmed, or in-progress appointments can be marked complete',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    appointment.status = 'completed';
    appointment.paymentStatus = 'released';
    await appointment.save();

    return { data: await this.toResponse(appointment), message: 'Appointment marked complete' };
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

    return { data: await this.toResponse(appointment), message: 'Appointment cancelled' };
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

  private async toResponse(appointment: AppointmentDocument): Promise<AppointmentResponse> {
    const [response] = await this.toResponseList([appointment]);
    return response;
  }

  // Batches the vet->clinic payout-account lookup and resolves a fresh signed proof URL for
  // every appointment in one pass, so listAppointments doesn't N+1 per row.
  private async toResponseList(appointments: AppointmentDocument[]): Promise<AppointmentResponse[]> {
    if (appointments.length === 0) return [];

    const vetIds = [...new Set(
      appointments.filter((a) => a.paymentMethod !== 'cod').map((a) => a.vet.toString()),
    )];
    const vets = vetIds.length
      ? await this.vetModel.find({ _id: { $in: vetIds } }).select('clinicId').lean().exec()
      : [];
    const clinicIds = [...new Set(
      vets.filter((v) => v.clinicId).map((v) => (v.clinicId as Types.ObjectId).toString()),
    )];
    const clinics = clinicIds.length
      ? await this.clinicModel.find({ _id: { $in: clinicIds } }).lean().exec()
      : [];
    const clinicMap = new Map(clinics.map((c) => [(c._id as Types.ObjectId).toString(), c]));
    const vetClinicMap = new Map(
      vets.map((v) => [
        (v._id as Types.ObjectId).toString(),
        v.clinicId ? (clinicMap.get((v.clinicId as Types.ObjectId).toString()) ?? null) : null,
      ]),
    );

    return Promise.all(appointments.map(async (a) => {
      const clinic = a.paymentMethod === 'cod' ? null : vetClinicMap.get(a.vet.toString()) ?? null;
      const paymentProofUrl = a.paymentProofUrl
        ? await this.s3Service.getSignedReadUrl(a.paymentProofUrl)
        : null;
      return toAppointmentResponse(a, paymentProofUrl, clinic);
    }));
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

  private async findVetAppointment(
    vetId: string,
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

    if (appointment.vet.toString() !== vetId) {
      throw new ForbiddenException({ message: 'Not authorized', code: 'FORBIDDEN' });
    }

    return appointment;
  }
}
