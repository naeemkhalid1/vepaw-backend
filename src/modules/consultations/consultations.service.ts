import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConsultationSession,
  ConsultationSessionDocument,
} from '../../database/schemas/consultation-session.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../database/schemas/appointment.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Clinic, ClinicDocument } from '../../database/schemas/clinic.schema';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import {
  Message,
  MessageDocument,
} from '../../database/schemas/message.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { SafepayService } from '../../common/payments/safepay.service';
import {
  SafepayWebhookEvent,
  extractTrackerToken,
} from '../../common/payments/safepay-webhook-event.interface';
import { toConsultationSessionResponse } from '../../shared/mappers/consultation.mapper';
import {
  ConsultationSessionResponse,
  MessageResponse,
  ServiceResponse,
} from '../../shared/types';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { ChatGateway } from '../realtime/gateways/chat.gateway';

const ACTIVE_OR_PENDING_STATUSES = [
  'pending_payment',
  'active',
  'disputed',
] as const;

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectModel(ConsultationSession.name)
    private readonly consultationModel: Model<ConsultationSessionDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(Thread.name)
    private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly safepayService: SafepayService,
    private readonly config: ConfigService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createConsultation(
    userId: string,
    dto: CreateConsultationDto,
  ): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const pet = await this.petModel.findById(dto.petId).lean().exec();
    if (!pet)
      throw new NotFoundException({
        message: 'Pet not found',
        code: 'PET_NOT_FOUND',
      });
    if (pet.owner.toString() !== userId) {
      throw new ForbiddenException({
        message: 'You do not own this pet',
        code: 'FORBIDDEN',
      });
    }

    const owner = await this.userModel
      .findById(userId)
      .select('name')
      .lean()
      .exec();

    const vetObjectId = new Types.ObjectId(dto.vetId);
    const vet = await this.vetModel.findById(vetObjectId).lean().exec();
    if (!vet)
      throw new NotFoundException({
        message: 'Vet not found',
        code: 'VET_NOT_FOUND',
      });
    if (!vet.textEnabled || !vet.textConsultFee) {
      throw new BadRequestException({
        message: 'This vet has not enabled paid text consultations',
        code: 'TEXT_CONSULT_UNAVAILABLE',
      });
    }

    const ownerObjectId = new Types.ObjectId(userId);
    const petObjectId = new Types.ObjectId(dto.petId);

    const hasHistory = await this.appointmentModel
      .exists({
        vet: vetObjectId,
        pet: petObjectId,
        owner: ownerObjectId,
        status: 'completed',
      })
      .exec();
    if (!hasHistory) {
      throw new BadRequestException({
        message:
          'A completed appointment with this vet is required before starting a paid consultation',
        code: 'NO_EXISTING_RELATIONSHIP',
      });
    }

    const existing = await this.consultationModel
      .findOne({
        owner: ownerObjectId,
        vet: vetObjectId,
        status: { $in: ACTIVE_OR_PENDING_STATUSES },
      })
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
      clinicId: vet.clinicId ?? null,
      thread: thread._id,
      amount: vet.textConsultFee,
      status: 'pending_payment',
    });

    const sessionId = (session._id as Types.ObjectId).toString();
    const frontendBaseUrl = this.config.getOrThrow<string>('FRONTEND_BASE_URL');
    const { trackerToken, checkoutUrl } =
      await this.safepayService.createCheckoutSession(
        vet.textConsultFee,
        sessionId,
        `${frontendBaseUrl}/callback?type=consultation&id=${sessionId}&result=success`,
        `${frontendBaseUrl}/callback?type=consultation&id=${sessionId}&result=cancelled`,
      );
    session.paymentReference = trackerToken;
    await session.save();

    await this.postStatusMessage(
      session,
      thread._id as Types.ObjectId,
      'user',
      'pending_payment',
      'Consultation requested',
    );

    const clinic = vet.clinicId
      ? await this.clinicModel.findById(vet.clinicId).lean().exec()
      : null;

    return {
      data: toConsultationSessionResponse(
        session.toObject(),
        pet.name,
        vet.name,
        owner?.name ?? 'Owner',
        clinic,
        checkoutUrl,
      ),
      message: 'Consultation session created — awaiting payment',
    };
  }

  // Idempotent — matches on current status so a replayed webhook is a no-op. Never throws:
  // Safepay expects a 2xx ack within 10s regardless of whether the tracker was recognized.
  async handleSafepayEvent(event: SafepayWebhookEvent): Promise<void> {
    const tracker = extractTrackerToken(event);
    if (!tracker) {
      this.logger.warn(
        `Safepay webhook missing tracker token: ${JSON.stringify(event)}`,
      );
      return;
    }

    if (event.type === 'payment.succeeded') {
      const now = new Date();
      const updated = await this.consultationModel
        .findOneAndUpdate(
          { paymentReference: tracker, status: 'pending_payment' },
          {
            $set: {
              status: 'active',
              paidAt: now,
              startedAt: now,
              autoExpireAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          { new: true },
        )
        .exec();

      if (!updated) {
        this.logger.warn(
          `Safepay payment.succeeded: no matching pending_payment session for tracker ${tracker}`,
        );
        return;
      }

      await this.postStatusMessage(
        updated,
        updated.thread as Types.ObjectId,
        'doctor',
        'active',
        'Payment confirmed — consultation started',
      );
      return;
    }

    if (event.type === 'payment.failed') {
      const updated = await this.consultationModel
        .findOneAndUpdate(
          { paymentReference: tracker, status: 'pending_payment' },
          {
            $set: {
              status: 'cancelled',
              closedBy: 'system',
              closedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();

      if (!updated) {
        this.logger.warn(
          `Safepay payment.failed: no matching pending_payment session for tracker ${tracker}`,
        );
        return;
      }

      await this.postStatusMessage(
        updated,
        updated.thread as Types.ObjectId,
        'doctor',
        'cancelled',
        'Payment failed — consultation cancelled',
      );
      return;
    }

    this.logger.log(`Ignoring unhandled Safepay event type: ${event.type}`);
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
      this.logger.log(
        `Auto-expired ${stale.length} stale consultation session(s)`,
      );
    }
  }

  async cancelConsultation(
    userId: string,
    sessionId: string,
  ): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const ownerObjectId = new Types.ObjectId(userId);

    // Atomic ownership+status-scoped update: a session that isn't found by this filter is
    // either not owned by this caller or doesn't exist — both collapse to 404 below, matching
    // the same "don't reveal existence" pattern as SESSION_NOT_FOUND elsewhere in this module.
    const updated = await this.consultationModel
      .findOneAndUpdate(
        { _id: sessionId, owner: ownerObjectId, status: 'pending_payment' },
        {
          $set: {
            status: 'cancelled',
            closedBy: 'system',
            closedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const owned = await this.consultationModel
        .findOne({ _id: sessionId, owner: ownerObjectId })
        .lean()
        .exec();
      if (!owned)
        throw new NotFoundException({
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      throw new BadRequestException({
        message:
          'Only a session awaiting payment can be cancelled — once payment is submitted, this goes through the dispute flow instead',
        code: 'INVALID_STATUS',
      });
    }

    await this.postStatusMessage(
      updated,
      updated.thread as Types.ObjectId,
      'user',
      'cancelled',
      'Consultation cancelled',
    );

    const [pet, vet, owner] = await Promise.all([
      this.petModel.findById(updated.pet).select('name').lean().exec(),
      this.vetModel.findById(updated.vet).lean().exec(),
      this.userModel.findById(updated.owner).select('name').lean().exec(),
    ]);
    const clinic = vet?.clinicId
      ? await this.clinicModel.findById(vet.clinicId).lean().exec()
      : null;

    return {
      data: toConsultationSessionResponse(
        updated.toObject(),
        pet?.name ?? 'Pet',
        vet?.name ?? 'Vet',
        owner?.name ?? 'Owner',
        clinic,
      ),
      message: 'Consultation cancelled',
    };
  }

  async listMyConsultations(
    userId: string,
  ): Promise<ServiceResponse<ConsultationSessionResponse[]>> {
    const sessions = await this.consultationModel
      .find({ owner: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      data: await this.hydrateList(sessions),
      message: 'Consultations retrieved',
    };
  }

  async getConsultation(
    userId: string,
    sessionId: string,
  ): Promise<ServiceResponse<ConsultationSessionResponse>> {
    const session = await this.consultationModel
      .findById(sessionId)
      .lean()
      .exec();
    if (!session)
      throw new NotFoundException({
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    if (session.owner.toString() !== userId) {
      throw new ForbiddenException({
        message: 'You do not own this session',
        code: 'FORBIDDEN',
      });
    }

    const [pet, vet, owner] = await Promise.all([
      this.petModel.findById(session.pet).select('name').lean().exec(),
      this.vetModel.findById(session.vet).lean().exec(),
      this.userModel.findById(session.owner).select('name').lean().exec(),
    ]);
    const clinic = vet?.clinicId
      ? await this.clinicModel.findById(vet.clinicId).lean().exec()
      : null;

    return {
      data: toConsultationSessionResponse(
        session,
        pet?.name ?? 'Pet',
        vet?.name ?? 'Vet',
        owner?.name ?? 'Owner',
        clinic,
      ),
      message: 'Consultation retrieved',
    };
  }

  private async hydrateList(
    sessions: (ConsultationSession & {
      _id: Types.ObjectId;
      createdAt: Date;
      updatedAt: Date;
    })[],
  ): Promise<ConsultationSessionResponse[]> {
    if (sessions.length === 0) return [];

    const petIds = [
      ...new Set(sessions.map((s) => (s.pet as Types.ObjectId).toString())),
    ];
    const vetIds = [
      ...new Set(sessions.map((s) => (s.vet as Types.ObjectId).toString())),
    ];
    const ownerIds = [
      ...new Set(sessions.map((s) => (s.owner as Types.ObjectId).toString())),
    ];

    const [pets, vets, owners] = await Promise.all([
      this.petModel
        .find({ _id: { $in: petIds } })
        .select('name')
        .lean()
        .exec(),
      this.vetModel
        .find({ _id: { $in: vetIds } })
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $in: ownerIds } })
        .select('name')
        .lean()
        .exec(),
    ]);

    const clinicIds = [
      ...new Set(
        vets
          .filter((v) => v.clinicId)
          .map((v) => (v.clinicId as Types.ObjectId).toString()),
      ),
    ];
    const clinics = clinicIds.length
      ? await this.clinicModel
          .find({ _id: { $in: clinicIds } })
          .lean()
          .exec()
      : [];

    const petNames = new Map(
      pets.map((p) => [(p._id as Types.ObjectId).toString(), p.name]),
    );
    const vetMap = new Map(
      vets.map((v) => [(v._id as Types.ObjectId).toString(), v]),
    );
    const ownerNames = new Map(
      owners.map((o) => [(o._id as Types.ObjectId).toString(), o.name]),
    );
    const clinicMap = new Map(
      clinics.map((c) => [(c._id as Types.ObjectId).toString(), c]),
    );

    return sessions.map((s) => {
      const vet = vetMap.get((s.vet as Types.ObjectId).toString());
      const clinic = vet?.clinicId
        ? clinicMap.get((vet.clinicId as Types.ObjectId).toString())
        : null;
      return toConsultationSessionResponse(
        s,
        petNames.get((s.pet as Types.ObjectId).toString()) ?? 'Pet',
        vet?.name ?? 'Vet',
        ownerNames.get((s.owner as Types.ObjectId).toString()) ?? 'Owner',
        clinic,
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

    this.chatGateway.server
      .to(threadId.toString())
      .emit('message:received', response);
  }
}
