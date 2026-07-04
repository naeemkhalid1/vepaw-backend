import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConsultationSession,
  ConsultationSessionDocument,
} from '../../database/schemas/consultation-session.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../database/schemas/message.schema';
import { S3Service } from '../../common/storage/s3.service';
import { toConsultationSessionResponse } from '../../shared/mappers/consultation.mapper';
import { ConsultationSessionResponse, MessageResponse, ServiceResponse } from '../../shared/types';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { ChatGateway } from '../realtime/gateways/chat.gateway';

const ACTIVE_OR_PENDING_STATUSES = ['pending_payment', 'payment_submitted', 'active'] as const;

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectModel(ConsultationSession.name)
    private readonly consultationModel: Model<ConsultationSessionDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    private readonly s3Service: S3Service,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createConsultation(
    userId: string,
    dto: CreateConsultationDto,
  ): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const pet = await this.petModel.findById(dto.petId).lean().exec();
    if (!pet) throw new NotFoundException({ message: 'Pet not found', code: 'PET_NOT_FOUND' });
    if (pet.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this pet', code: 'FORBIDDEN' });
    }

    const vetObjectId = new Types.ObjectId(dto.vetId);
    const vet = await this.vetModel.findById(vetObjectId).lean().exec();
    if (!vet) throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });
    if (!vet.textEnabled || !vet.textConsultFee) {
      throw new BadRequestException({
        message: 'This vet has not enabled paid text consultations',
        code: 'TEXT_CONSULT_UNAVAILABLE',
      });
    }

    const ownerObjectId = new Types.ObjectId(userId);
    const petObjectId = new Types.ObjectId(dto.petId);

    const hasHistory = await this.appointmentModel
      .exists({ vet: vetObjectId, pet: petObjectId, owner: ownerObjectId, status: 'completed' })
      .exec();
    if (!hasHistory) {
      throw new BadRequestException({
        message: 'A completed appointment with this vet is required before starting a paid consultation',
        code: 'NO_EXISTING_RELATIONSHIP',
      });
    }

    const existing = await this.consultationModel
      .findOne({ owner: ownerObjectId, vet: vetObjectId, status: { $in: ACTIVE_OR_PENDING_STATUSES } })
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException({
        message: 'You already have an in-progress consultation with this vet',
        code: 'CONSULTATION_ALREADY_IN_PROGRESS',
      });
    }

    let thread = await this.threadModel
      .findOne({ user: ownerObjectId, vetId: vetObjectId, type: 'vet' })
      .lean()
      .exec();
    if (!thread) {
      const created = await this.threadModel.create({
        user: ownerObjectId,
        type: 'vet',
        name: vet.name,
        vetId: vetObjectId,
        verified: vet.verified ?? false,
      });
      thread = created.toObject();
    }

    const session = await this.consultationModel.create({
      owner: ownerObjectId,
      pet: petObjectId,
      vet: vetObjectId,
      thread: thread._id,
      amount: vet.textConsultFee,
      status: 'pending_payment',
    });

    await this.postStatusMessage(session, thread._id as Types.ObjectId, 'user', 'pending_payment', 'Consultation requested');

    return {
      data: toConsultationSessionResponse(session.toObject(), pet.name, vet.name, vet),
      message: 'Consultation session created — awaiting payment',
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleConsultations(): Promise<void> {
    const stale = await this.consultationModel
      .find({ status: 'active', autoExpireAt: { $lt: new Date() } })
      .exec();

    for (const session of stale) {
      session.status = 'expired';
      session.closedBy = 'system';
      session.closedAt = new Date();
      await session.save();

      await this.postStatusMessage(
        session,
        session.thread as Types.ObjectId,
        'doctor',
        'expired',
        'Consultation ended',
      );
    }

    if (stale.length > 0) {
      this.logger.log(`Auto-expired ${stale.length} stale consultation session(s)`);
    }
  }

  async submitPayment(
    userId: string,
    sessionId: string,
    proof: Express.Multer.File,
  ): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const session = await this.consultationModel.findById(sessionId).exec();
    if (!session) throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
    if (session.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this session', code: 'FORBIDDEN' });
    }
    if (session.status !== 'pending_payment') {
      throw new BadRequestException({
        message: 'Payment can only be submitted while awaiting payment',
        code: 'INVALID_STATUS',
      });
    }

    const proofUrl = await this.s3Service.uploadImage(proof, 'consultation-payments');
    session.paymentProofUrl = proofUrl;
    session.paymentSubmittedAt = new Date();
    session.status = 'payment_submitted';
    await session.save();

    await this.postStatusMessage(session, session.thread as Types.ObjectId, 'user', 'payment_submitted', 'Payment submitted, awaiting vet confirmation');

    const [pet, vet] = await Promise.all([
      this.petModel.findById(session.pet).select('name').lean().exec(),
      this.vetModel.findById(session.vet).lean().exec(),
    ]);

    return {
      data: toConsultationSessionResponse(session.toObject(), pet?.name ?? 'Pet', vet?.name ?? 'Vet', vet),
      message: 'Payment proof submitted',
    };
  }

  async listMyConsultations(userId: string): Promise<ServiceResponse<ConsultationSessionResponse[]>> {
    const sessions = await this.consultationModel
      .find({ owner: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return { data: await this.hydrateList(sessions), message: 'Consultations retrieved' };
  }

  async getConsultation(userId: string, sessionId: string): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const session = await this.consultationModel.findById(sessionId).lean().exec();
    if (!session) throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
    if (session.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this session', code: 'FORBIDDEN' });
    }

    const [pet, vet] = await Promise.all([
      this.petModel.findById(session.pet).select('name').lean().exec(),
      this.vetModel.findById(session.vet).lean().exec(),
    ]);

    return {
      data: toConsultationSessionResponse(session, pet?.name ?? 'Pet', vet?.name ?? 'Vet', vet),
      message: 'Consultation retrieved',
    };
  }

  private async hydrateList(
    sessions: (ConsultationSession & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date })[],
  ): Promise<ConsultationSessionResponse[]> {
    if (sessions.length === 0) return [];

    const petIds = [...new Set(sessions.map((s) => (s.pet as Types.ObjectId).toString()))];
    const vetIds = [...new Set(sessions.map((s) => (s.vet as Types.ObjectId).toString()))];

    const [pets, vets] = await Promise.all([
      this.petModel.find({ _id: { $in: petIds } }).select('name').lean().exec(),
      this.vetModel.find({ _id: { $in: vetIds } }).lean().exec(),
    ]);

    const petNames = new Map(pets.map((p) => [(p._id as Types.ObjectId).toString(), p.name]));
    const vetMap = new Map(vets.map((v) => [(v._id as Types.ObjectId).toString(), v]));

    return sessions.map((s) => {
      const vet = vetMap.get((s.vet as Types.ObjectId).toString());
      return toConsultationSessionResponse(
        s,
        petNames.get((s.pet as Types.ObjectId).toString()) ?? 'Pet',
        vet?.name ?? 'Vet',
        vet,
      );
    });
  }

  private async postStatusMessage(
    session: ConsultationSessionDocument,
    threadId: Types.ObjectId,
    sender: 'user' | 'doctor',
    status: ConsultationSessionDocument['status'],
    previewText: string,
  ): Promise<void> {
    const message = await this.messageModel.create({
      thread: threadId,
      type: 'consultation_status',
      sender,
      text: null,
      consultationStatus: {
        sessionId: session._id,
        status,
      },
    });

    await this.threadModel.findByIdAndUpdate(threadId, {
      preview: previewText,
      $inc: { unread: 1 },
    });

    const response: MessageResponse = {
      id: (message._id as Types.ObjectId).toString(),
      thread: threadId.toString(),
      type: 'consultation_status',
      sender,
      text: null,
      product: null,
      pet: null,
      clinicRequest: null,
      consultationStatus: {
        sessionId: (session._id as Types.ObjectId).toString(),
        status,
      },
      createdAt: (message as MessageDocument).createdAt,
    };

    this.chatGateway.server.to(threadId.toString()).emit('message:received', response);
  }
}
