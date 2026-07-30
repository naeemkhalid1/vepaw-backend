import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../../database/schemas/appointment.schema';
import {
  AppointmentReservation,
  AppointmentReservationDocument,
} from '../../database/schemas/appointment-reservation.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { Clinic, ClinicDocument } from '../../database/schemas/clinic.schema';
import { toAppointmentResponse } from '../../shared/mappers/appointment.mapper';
import { toAppointmentReservationResponse } from '../../shared/mappers/appointment-reservation.mapper';
import { toReviewResponse, ReviewRaw } from '../../shared/mappers/vet.mapper';
import {
  AppointmentResponse,
  AppointmentReservationResponse,
  ReviewResponse,
  ServiceResponse,
} from '../../shared/types';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateAppointmentReservationDto } from './dto/create-appointment-reservation.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import {
  karachiDateStr,
  karachiDateTimeToUTC,
} from '../../shared/utils/karachi-time.util';
import {
  isValidAppointmentTransition,
  PAYOUT_HOLD_MS,
} from '../../shared/utils/appointment-transitions.util';
import {
  SafepayWebhookEvent,
  extractTrackerToken,
  extractOrderId,
  extractAmount,
} from '../../common/payments/safepay-webhook-event.interface';
import { ClinicTeamService } from '../../common/vets/clinic-team.service';
import { SafepayService } from '../../common/payments/safepay.service';
import { NotificationsService } from '../notifications/notifications.service';

// Confirmed 2026-07-21: percentage-based (10%), not a flat PKR amount — same rate as paid
// consultations. This is a launch-phase rate, deliberately kept low to attract initial vets;
// expected to increase later. Separate from whatever Safepay's own processing fee takes —
// that happens on Safepay's side during settlement and never touches this number or the vet's
// payout. Move to ConfigService when fee tiers are introduced.
const PLATFORM_COMMISSION_RATE = 0.1;

// How long past the scheduled time an unresolved appointment is treated as a no-show
const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000;

// How long a safepay reservation soft-locks a slot before it's abandoned — auto-expires via
// the AppointmentReservation schema's TTL index, no cleanup job needed.
const RESERVATION_TTL_MINUTES = 15;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentReservation.name)
    private readonly reservationModel: Model<AppointmentReservationDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    private readonly clinicTeamService: ClinicTeamService,
    private readonly notificationsService: NotificationsService,
    private readonly safepayService: SafepayService,
    private readonly config: ConfigService,
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
      .filter(
        (a) =>
          karachiDateTimeToUTC(a.date, a.timeSlot).getTime() <
          now.getTime() - NO_SHOW_GRACE_MS,
      )
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

  // Appointments the owner disputed have status 'disputed', not 'completed' — excluded here
  // automatically, left for admin resolution (resolveDisputedAppointment) instead.
  @Cron(CronExpression.EVERY_HOUR)
  async releaseEligiblePayouts(): Promise<void> {
    const result = await this.appointmentModel.updateMany(
      {
        status: 'completed',
        paymentStatus: 'held',
        payoutEligibleAt: { $lte: new Date() },
      },
      { $set: { paymentStatus: 'released' } },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Released ${result.modifiedCount} eligible appointment payout(s)`,
      );
    }
  }

  async createAppointment(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    if (
      !Types.ObjectId.isValid(dto.vetId) ||
      !Types.ObjectId.isValid(dto.petId)
    ) {
      throw new NotFoundException({
        message: 'Vet or pet not found',
        code: 'NOT_FOUND',
      });
    }

    const [vet, pet] = await Promise.all([
      this.vetModel.findOne({
        _id: dto.vetId,
        verified: true,
        subscriptionStatus: 'active',
      }),
      this.petModel.findOne({
        _id: dto.petId,
        owner: new Types.ObjectId(userId),
        isActive: true,
      }),
    ]);

    if (!vet) {
      throw new NotFoundException({
        message: 'Vet not found',
        code: 'VET_NOT_FOUND',
      });
    }
    if (!pet) {
      throw new NotFoundException({
        message: 'Pet not found',
        code: 'PET_NOT_FOUND',
      });
    }

    const [slotTaken, slotReserved] = await Promise.all([
      this.appointmentModel.exists({
        vet: new Types.ObjectId(dto.vetId),
        date: dto.date,
        timeSlot: dto.timeSlot,
        status: { $in: ['pending', 'confirmed'] },
      }),
      this.reservationModel.exists({
        vet: new Types.ObjectId(dto.vetId),
        date: dto.date,
        timeSlot: dto.timeSlot,
        expiresAt: { $gt: new Date() },
      }),
    ]);

    if (slotTaken || slotReserved) {
      throw new UnprocessableEntityException({
        message: 'This time slot is no longer available',
        code: 'SLOT_UNAVAILABLE',
      });
    }

    // Always the vet's own minimum fee — never trusted from the client. dto.fee still exists on
    // the request DTO purely so existing app requests that send it don't 400 against the global
    // whitelist pipe; its value is ignored entirely.
    const fee = vet.fee.min;
    const platformCommission = Math.round(fee * PLATFORM_COMMISSION_RATE);
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

    return {
      data: await this.toResponse(appointment),
      message: 'Appointment created',
    };
  }

  // Safepay-only: soft-locks a slot for RESERVATION_TTL_MINUTES while checkout is in progress,
  // without creating a real Appointment the vet would see. Promoted into a real Appointment on
  // payment.succeeded, or left to expire (via the schema's TTL index — no cleanup job needed)
  // if the user abandons checkout. See PENDING_FEATURES.md-style context: this exists so
  // abandoned/unpaid bookings never clutter the vet's appointment list.
  async createReservation(
    userId: string,
    dto: CreateAppointmentReservationDto,
  ): Promise<ServiceResponse<AppointmentReservationResponse>> {
    if (
      !Types.ObjectId.isValid(dto.vetId) ||
      !Types.ObjectId.isValid(dto.petId)
    ) {
      throw new NotFoundException({
        message: 'Vet or pet not found',
        code: 'NOT_FOUND',
      });
    }

    const [vet, pet] = await Promise.all([
      this.vetModel.findOne({
        _id: dto.vetId,
        verified: true,
        subscriptionStatus: 'active',
      }),
      this.petModel.findOne({
        _id: dto.petId,
        owner: new Types.ObjectId(userId),
        isActive: true,
      }),
    ]);

    if (!vet) {
      throw new NotFoundException({
        message: 'Vet not found',
        code: 'VET_NOT_FOUND',
      });
    }
    if (!pet) {
      throw new NotFoundException({
        message: 'Pet not found',
        code: 'PET_NOT_FOUND',
      });
    }

    const slotTaken = await this.appointmentModel.exists({
      vet: new Types.ObjectId(dto.vetId),
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

    // Always the vet's own minimum fee — never trusted from the client, same as
    // createAppointment() above. dto.fee still exists on the request DTO purely so existing
    // app requests that send it don't 400 against the global whitelist pipe; its value is
    // ignored entirely.
    const fee = vet.fee.min;
    const platformCommission = Math.round(fee * PLATFORM_COMMISSION_RATE);
    const vetPayout = fee - platformCommission;
    const expiresAt = new Date(
      Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000,
    );

    // Clears out a stale reservation for this exact slot before attempting the insert, so an
    // expired reservation that hasn't been physically TTL-swept yet (up to ~60s lag) never
    // falsely blocks a legitimately-new one. This is a no-op if nothing expired is there.
    await this.reservationModel.deleteOne({
      vet: new Types.ObjectId(dto.vetId),
      date: dto.date,
      timeSlot: dto.timeSlot,
      expiresAt: { $lte: new Date() },
    });

    let reservation: AppointmentReservationDocument;
    try {
      reservation = await this.reservationModel.create({
        pet: new Types.ObjectId(dto.petId),
        vet: new Types.ObjectId(dto.vetId),
        owner: new Types.ObjectId(userId),
        date: dto.date,
        timeSlot: dto.timeSlot,
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
        expiresAt,
      });
    } catch (err: unknown) {
      // The unique (vet, date, timeSlot) index is what actually closes the race: if another
      // request's reservation for this exact slot won the insert first, this one collides here
      // — atomically, at the database level — rather than both slipping through a check-then-
      // create gap. Anything else is a genuine unexpected error and should propagate.
      if ((err as { code?: number }).code === 11000) {
        throw new UnprocessableEntityException({
          message: 'This time slot is no longer available',
          code: 'SLOT_UNAVAILABLE',
        });
      }
      throw err;
    }

    const reservationId = reservation._id.toString();
    const frontendBaseUrl = this.config.getOrThrow<string>('FRONTEND_BASE_URL');
    const { trackerToken, checkoutUrl } =
      await this.safepayService.createCheckoutSession(
        fee,
        reservationId,
        `${frontendBaseUrl}/callback?type=appointment&id=${reservationId}&result=success`,
        `${frontendBaseUrl}/callback?type=appointment&id=${reservationId}&result=cancelled`,
      );
    reservation.paymentReference = trackerToken;
    await reservation.save();

    return {
      data: toAppointmentReservationResponse(reservation, checkoutUrl),
      message: 'Reservation created — complete payment before it expires',
    };
  }

  // The backend creates the Safepay checkout session itself (see createReservation above),
  // so it always knows the tracker/amount up front rather than trusting the client to declare
  // them — this re-check is defense-in-depth against a tampered or replayed webhook, not a
  // substitute for not knowing what should have been charged.
  //
  // Matched by order_id (the reservation's own _id, set as Safepay's order_id when the session
  // was created). Never throws: Safepay expects a 2xx ack within 10s regardless of outcome, or
  // it retries.
  async handleSafepayEvent(event: SafepayWebhookEvent): Promise<void> {
    const orderId = extractOrderId(event);
    if (!orderId || !Types.ObjectId.isValid(orderId)) {
      this.logger.warn(
        `Safepay webhook missing/invalid order_id: ${JSON.stringify(event)}`,
      );
      return;
    }
    const reservationObjectId = new Types.ObjectId(orderId);
    const tracker = extractTrackerToken(event);

    if (event.type === 'payment.succeeded') {
      // Deliberately not filtered by expiresAt > now: a webhook that's merely a little late for
      // a payment which genuinely started in-window should still succeed as long as the doc
      // hasn't been physically swept by Mongo's TTL monitor yet (~60s lag after logical expiry).
      const reservation = await this.reservationModel
        .findById(reservationObjectId)
        .exec();
      if (!reservation) {
        this.logger.warn(
          `Safepay payment.succeeded: no reservation for order_id ${orderId} (already promoted, or expired past TTL sweep)`,
        );
        return;
      }

      const paidAmount = extractAmount(event);
      if (paidAmount !== undefined && paidAmount !== reservation.fee) {
        this.logger.error(
          `Safepay payment.succeeded: amount mismatch for reservation ${orderId} — expected ${reservation.fee}, got ${paidAmount}. Not promoting.`,
        );
        return;
      }

      // Atomic consume: a duplicate webhook delivery finds nothing on its second lookup, same
      // idempotency guarantee the old paymentStatus:'pending' match used to provide.
      const consumed = await this.reservationModel
        .findByIdAndDelete(reservationObjectId)
        .lean()
        .exec();
      if (!consumed) {
        this.logger.warn(
          `Safepay payment.succeeded: reservation ${orderId} was already consumed by a concurrent webhook delivery`,
        );
        return;
      }

      // Reuses the reservation's own _id (== the order_id the app already has from
      // POST /appointments/reservations) rather than letting Mongo assign a fresh one — the
      // app polls GET /appointments/:id with that same ID expecting it to eventually resolve
      // into the real appointment, not 404 forever.
      const appointment = await this.appointmentModel.create({
        _id: consumed._id,
        pet: consumed.pet,
        vet: consumed.vet,
        owner: consumed.owner,
        date: consumed.date,
        timeSlot: consumed.timeSlot,
        paymentMethod: 'safepay',
        fee: consumed.fee,
        platformCommission: consumed.platformCommission,
        vetPayout: consumed.vetPayout,
        vetDetails: consumed.vetDetails,
        petDetails: consumed.petDetails,
        status: 'confirmed',
        paymentStatus: 'held',
        paymentReference: tracker,
      });

      const notifyTargets = await this.clinicTeamService.resolveNotifyTargets(
        appointment.vet.toString(),
      );
      await this.notificationsService.createForRecipients(
        notifyTargets,
        'vet',
        'booking',
        'Payment received',
        `${appointment.petDetails.name}'s appointment on ${appointment.date} — PKR ${appointment.fee} confirmed`,
        (appointment._id as Types.ObjectId).toString(),
      );
      return;
    }

    if (event.type === 'payment.failed') {
      // Actively delete rather than waiting out the TTL — frees the slot immediately on a
      // definitive "no", rather than making the next booker wait out the full reservation window.
      const deleted = await this.reservationModel
        .findByIdAndDelete(reservationObjectId)
        .exec();
      if (!deleted) {
        this.logger.warn(
          `Safepay payment.failed: no matching reservation for order_id ${orderId}`,
        );
      }
      return;
    }

    // Applies to an already-promoted Appointment (same _id as the original reservation) — a
    // refund/dispute can only happen after a real payment, never against a pending reservation.
    if (event.type === 'payment.refunded') {
      const updated = await this.appointmentModel
        .findOneAndUpdate(
          { _id: reservationObjectId, paymentStatus: { $ne: 'refunded' } },
          { $set: { paymentStatus: 'refunded' } },
          { new: true },
        )
        .exec();
      if (updated) {
        // Our own cancelAppointment()/updateAppointmentStatus() already set 'refunded'
        // synchronously before calling Safepay — reaching here means this webhook found it
        // NOT already marked refunded, which is the exact drift this confirmation exists to
        // catch and correct.
        this.logger.warn(
          `Safepay payment.refunded: appointment ${orderId} was not already marked refunded — corrected via webhook confirmation`,
        );
      }
      return;
    }

    if (
      event.type === 'payment.disputed' ||
      event.type === 'payment.dispute.won' ||
      event.type === 'payment.dispute.lost'
    ) {
      const chargebackStatus =
        event.type === 'payment.disputed'
          ? 'disputed'
          : event.type === 'payment.dispute.won'
            ? 'won'
            : 'lost';
      await this.appointmentModel
        .updateOne({ _id: reservationObjectId }, { $set: { chargebackStatus } })
        .exec();
      // High-visibility on purpose — a chargeback is a card-network-level event distinct from
      // this app's own dispute flow, and 'lost' means money is being forcibly reversed by the
      // card network regardless of what this app's own records say.
      this.logger.error(
        `Safepay ${event.type} for appointment ${orderId} — chargebackStatus set to '${chargebackStatus}'`,
      );
      return;
    }

    if (
      event.type === 'payment:created' ||
      event.type === 'refund:created' ||
      event.type === 'error:occurred'
    ) {
      this.logger.log(`Safepay ${event.type} for order_id ${orderId}`);
      return;
    }

    this.logger.log(`Ignoring unhandled Safepay event type: ${event.type}`);
  }

  // Routing check for the shared Safepay webhook entry point (this module's controller is the
  // single endpoint Safepay actually delivers to — see AppointmentsWebhookController) — lets it
  // find out an event belongs to a reservation before delegating to handleSafepayEvent above.
  // Must check both collections: the reservation only exists pre-payment and is deleted at
  // promotion (payment.succeeded), while the real Appointment reuses the same _id afterward —
  // a post-payment event (refund, dispute) would otherwise never match anything here and get
  // silently dropped by the webhook controller as "not owned by any domain."
  async ownsOrderId(orderId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(orderId)) return false;
    const [reservation, appointment] = await Promise.all([
      this.reservationModel.exists({ _id: orderId }),
      this.appointmentModel.exists({ _id: orderId }),
    ]);
    return reservation !== null || appointment !== null;
  }

  async listAppointments(
    userId: string,
    dto: ListAppointmentsDto,
  ): Promise<ServiceResponse<AppointmentResponse[]>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      owner: new Types.ObjectId(userId),
    };
    if (dto.status) filter.status = dto.status;

    const [items, total] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
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
    return {
      data: await this.toResponse(appointment),
      message: 'Appointment fetched',
    };
  }

  async completeAppointment(
    vetId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findVetAppointment(vetId, appointmentId);

    if (!isValidAppointmentTransition(appointment.status, 'completed')) {
      throw new UnprocessableEntityException({
        message:
          'Only pending, confirmed, or in-progress appointments can be marked complete',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    appointment.status = 'completed';
    if (appointment.paymentMethod === 'safepay' && appointment.paymentStatus === 'held') {
      appointment.payoutEligibleAt = new Date(Date.now() + PAYOUT_HOLD_MS);
    } else {
      // COD never had platform-held escrow to begin with — nothing to hold or dispute here.
      appointment.paymentStatus = 'released';
    }
    await appointment.save();

    return {
      data: await this.toResponse(appointment),
      message: 'Appointment marked complete',
    };
  }

  async disputeAppointment(
    userId: string,
    appointmentId: string,
    reason: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);

    if (appointment.status !== 'completed' || appointment.paymentStatus !== 'held') {
      throw new UnprocessableEntityException({
        message: 'Only a completed appointment with a payout still pending can be disputed',
        code: 'NOT_DISPUTABLE',
      });
    }
    if (
      !appointment.payoutEligibleAt ||
      appointment.payoutEligibleAt.getTime() <= Date.now()
    ) {
      throw new UnprocessableEntityException({
        message: 'The window to report a problem with this appointment has passed',
        code: 'DISPUTE_WINDOW_CLOSED',
      });
    }

    appointment.status = 'disputed';
    appointment.disputeReason = reason;
    await appointment.save();

    return {
      data: await this.toResponse(appointment),
      message: 'Appointment disputed — under review',
    };
  }

  async cancelAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<ServiceResponse<AppointmentResponse>> {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);

    if (!isValidAppointmentTransition(appointment.status, 'cancelled')) {
      throw new UnprocessableEntityException({
        message: 'Only pending or confirmed appointments can be cancelled',
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    // Refund before committing the cancellation — if Safepay fails, the appointment stays in
    // its current status so the owner can retry, instead of ending up 'cancelled' with a
    // 'refunded' label while no money actually moved.
    if (
      appointment.paymentStatus === 'held' &&
      appointment.paymentMethod === 'safepay' &&
      appointment.paymentReference
    ) {
      try {
        await this.safepayService.refundPayment(
          appointment.paymentReference,
          appointment.fee,
        );
      } catch (err) {
        this.logger.error(
          `Refund failed for appointment ${appointmentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new UnprocessableEntityException({
          message: 'Unable to process the refund right now — please try again shortly',
          code: 'REFUND_FAILED',
        });
      }
      appointment.paymentStatus = 'refunded';
    }

    appointment.status = 'cancelled';
    await appointment.save();

    return {
      data: await this.toResponse(appointment),
      message: 'Appointment cancelled',
    };
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

  private async updateVetRating(
    vetId: string,
    newRating: number,
  ): Promise<void> {
    const vet = await this.vetModel
      .findById(vetId)
      .select('rating reviewCount')
      .lean<{ rating: number; reviewCount: number }>();
    if (!vet) return;

    const newCount = vet.reviewCount + 1;
    const newAvg =
      Math.round(((vet.rating * vet.reviewCount + newRating) / newCount) * 10) /
      10;

    await this.vetModel.updateOne(
      { _id: vetId },
      { $set: { rating: newAvg, reviewCount: newCount } },
    );
  }

  private async toResponse(
    appointment: AppointmentDocument,
  ): Promise<AppointmentResponse> {
    const [response] = await this.toResponseList([appointment]);
    return response;
  }

  // Batches the vet->clinic payout-account lookup for every appointment in one pass, so
  // listAppointments doesn't N+1 per row.
  private async toResponseList(
    appointments: AppointmentDocument[],
  ): Promise<AppointmentResponse[]> {
    if (appointments.length === 0) return [];

    const vetIds = [
      ...new Set(
        appointments
          .filter((a) => a.paymentMethod !== 'cod')
          .map((a) => a.vet.toString()),
      ),
    ];
    const vets = vetIds.length
      ? await this.vetModel
          .find({ _id: { $in: vetIds } })
          .select('clinicId')
          .lean()
          .exec()
      : [];
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
    const clinicMap = new Map(
      clinics.map((c) => [(c._id as Types.ObjectId).toString(), c]),
    );
    const vetClinicMap = new Map(
      vets.map((v) => [
        (v._id as Types.ObjectId).toString(),
        v.clinicId
          ? (clinicMap.get((v.clinicId as Types.ObjectId).toString()) ?? null)
          : null,
      ]),
    );

    return appointments.map((a) => {
      const clinic =
        a.paymentMethod === 'cod'
          ? null
          : (vetClinicMap.get(a.vet.toString()) ?? null);
      return toAppointmentResponse(a, clinic);
    });
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
      throw new ForbiddenException({
        message: 'Not authorized',
        code: 'FORBIDDEN',
      });
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
      throw new ForbiddenException({
        message: 'Not authorized',
        code: 'FORBIDDEN',
      });
    }

    return appointment;
  }
}
