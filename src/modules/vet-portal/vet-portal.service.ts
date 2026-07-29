import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Clinic, ClinicDocument } from '../../database/schemas/clinic.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import {
  AppointmentReservation,
  AppointmentReservationDocument,
} from '../../database/schemas/appointment-reservation.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import {
  PayoutAccountAudit,
  PayoutAccountAuditDocument,
} from '../../database/schemas/payout-account-audit.schema';
import { Listing, ListingDocument } from '../../database/schemas/listing.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
import { TimeOff, TimeOffDocument } from '../../database/schemas/time-off.schema';
import { VisitNote, VisitNoteDocument } from '../../database/schemas/visit-note.schema';
import { VetApplication, VetApplicationDocument } from '../../database/schemas/vet-application.schema';
import { BlockedSlot, BlockedSlotDocument } from '../../database/schemas/blocked-slot.schema';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../database/schemas/message.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { ClinicDispense, ClinicDispenseDocument } from '../../database/schemas/clinic-dispense.schema';
import {
  ConsultationSession,
  ConsultationSessionDocument,
} from '../../database/schemas/consultation-session.schema';
import { toClinicDispenseResponse } from '../../shared/mappers/clinic-request.mapper';
import { toConsultationSessionResponse } from '../../shared/mappers/consultation.mapper';
import { ChatGateway } from '../realtime/gateways/chat.gateway';
import {
  ServiceResponse,
  MessageResponse,
  PetSharePayload,
  ClinicDispenseResponse,
  ConsultationSessionResponse,
  JwtPayload,
} from '../../shared/types';
import { S3Service } from '../../common/storage/s3.service';
import { BrevoEmailService } from '../../common/email/brevo-email.service';
import { SafepayService } from '../../common/payments/safepay.service';
import { UpdateVetProfileDto } from './dto/update-vet-profile.dto';
import { AddVisitNoteDto } from './dto/add-visit-note.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';
import { BlockSlotsDto } from './dto/block-slots.dto';
import { BlockDayDto } from './dto/block-day.dto';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { AcceptVetInviteDto } from './dto/accept-vet-invite.dto';
import { UpdatePayoutAccountDto } from './dto/update-status.dto';
import { karachiDateStr, karachiTimeStr, karachiStartOfMonth, karachiDateTimeToUTC } from '../../shared/utils/karachi-time.util';
import { PayoutMethod, payoutMethodLabel, payoutAccountValue, maskPayoutValue } from '../../shared/utils/payout-account.util';
import {
  isValidAppointmentTransition,
  PAYOUT_HOLD_MS,
} from '../../shared/utils/appointment-transitions.util';

const AVATAR_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const CATEGORY_COLORS: Record<string, { icon: string; bg: string }> = {
  medicine: { icon: '#6366F1', bg: '#EEF2FF' },
  food: { icon: '#F59E0B', bg: '#FFFBEB' },
  treats: { icon: '#10B981', bg: '#ECFDF5' },
};
const PET_TYPE_COLORS: Record<string, string> = { dog: '#6366F1', cat: '#F59E0B', bird: '#10B981', exotic: '#EC4899', other: '#8B5CF6' };

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// payoutMethodLabel/payoutAccountValue/maskPayoutValue moved to
// shared/utils/payout-account.util.ts — reused by store-portal for the same purpose.

function getColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function petAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  if (years > 0) return `${years}y ${months > 0 ? months + 'mo' : ''}`.trim();
  return `${Math.max(1, months)}mo`;
}

// Held-but-not-yet-eligible payouts show a countdown so the vet can tell them apart from money
// that's actually available — rounds up so "in Xh" never overstates how soon it lands.
function toPayoutLabel(
  paymentStatus: string,
  payoutEligibleAt: Date | null | undefined,
): string | null {
  if (paymentStatus !== 'held' || !payoutEligibleAt) return null;
  const msRemaining = payoutEligibleAt.getTime() - Date.now();
  if (msRemaining <= 0) return null;
  const hours = Math.ceil(msRemaining / (60 * 60 * 1000));
  return `Releases in ${hours}h`;
}

function getCategoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

@Injectable()
export class VetPortalService {
  private readonly logger = new Logger(VetPortalService.name);

  constructor(
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentReservation.name)
    private readonly reservationModel: Model<AppointmentReservationDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(PayoutAccountAudit.name)
    private readonly payoutAccountAuditModel: Model<PayoutAccountAuditDocument>,
    @InjectModel(Listing.name) private readonly listingModel: Model<ListingDocument>,
    @InjectModel(Invite.name) private readonly inviteModel: Model<InviteDocument>,
    @InjectModel(TimeOff.name) private readonly timeOffModel: Model<TimeOffDocument>,
    @InjectModel(VisitNote.name) private readonly visitNoteModel: Model<VisitNoteDocument>,
    @InjectModel(VetApplication.name) private readonly vetApplicationModel: Model<VetApplicationDocument>,
    @InjectModel(BlockedSlot.name) private readonly blockedSlotModel: Model<BlockedSlotDocument>,
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(ClinicDispense.name) private readonly clinicDispenseModel: Model<ClinicDispenseDocument>,
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(ConsultationSession.name)
    private readonly consultationModel: Model<ConsultationSessionDocument>,
    private readonly chatGateway: ChatGateway,
    private readonly s3Service: S3Service,
    private readonly emailService: BrevoEmailService,
    private readonly safepayService: SafepayService,
  ) {}

  // ─── Profile ────────────────────────────────────────────
  // Personal fields only — every staff member (admin_vet/team_vet/manager) is their own Vet
  // document, so this works identically regardless of staffRole. Business-identity fields
  // (clinicName/phone/address/payout) stay on the clinic-settings endpoint.

  async getMyProfile(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    return {
      data: {
        name: vet.name,
        photo: vet.photo,
        about: vet.about,
        specialty: vet.specialty,
        yearsExperience: vet.yearsExperience,
        languages: vet.languages,
      },
      message: 'Profile retrieved',
    };
  }

  async updateMyProfile(
    vetId: string,
    dto: UpdateVetProfileDto,
    photo?: Express.Multer.File,
  ): Promise<ServiceResponse<Record<string, unknown>>> {
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.about !== undefined) update.about = dto.about;
    if (dto.specialty !== undefined) update.specialty = dto.specialty;
    if (dto.yearsExperience !== undefined) {
      const parsed = parseInt(dto.yearsExperience, 10);
      if (!isNaN(parsed)) update.yearsExperience = parsed;
    }
    if (dto.languages !== undefined) update.languages = dto.languages;
    if (photo) update.photo = await this.s3Service.uploadImage(photo, 'avatars');

    const vet = await this.vetModel
      .findByIdAndUpdate(vetId, { $set: update }, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!vet) throw new NotFoundException('Vet not found');

    return {
      data: {
        name: vet.name,
        photo: vet.photo,
        about: vet.about,
        specialty: vet.specialty,
        yearsExperience: vet.yearsExperience,
        languages: vet.languages,
      },
      message: 'Profile updated',
    };
  }

  // ─── Schedule ──────────────────────────────────────────

  async getScheduleStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vid = new Types.ObjectId(vetId);
    const today = karachiDateStr();
    const startOfMonth = karachiStartOfMonth();

    const [todayAppts, monthAppts, vet] = await Promise.all([
      this.appointmentModel.find({ vet: vid, date: today }).lean().exec(),
      this.appointmentModel.find({ vet: vid, createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.vetModel.findById(vetId).lean().exec(),
    ]);

    const confirmed = todayAppts.filter((a) => a.status === 'confirmed' || a.status === 'in-progress').length;
    const pending = todayAppts.filter((a) => a.status === 'pending').length;
    const pendingEarnings = todayAppts.filter((a) => a.status !== 'cancelled').reduce((s, a) => s + a.vetPayout, 0);
    const upcomingReleases = todayAppts
      .filter((a) => a.paymentStatus === 'held' && a.payoutEligibleAt && a.payoutEligibleAt.getTime() > Date.now())
      .map((a) => (a.payoutEligibleAt as Date).getTime());
    const pendingEarningsNote =
      upcomingReleases.length > 0
        ? `Next release in ${Math.ceil((Math.min(...upcomingReleases) - Date.now()) / (60 * 60 * 1000))}h`
        : null;
    const monthBookings = monthAppts.length;
    const monthTotal = monthAppts.reduce((s, a) => s + a.fee, 0);

    const ownerIds = [...new Set(monthAppts.map((a) => a.owner.toString()))];
    const repeatOwners = ownerIds.filter((oid) => monthAppts.filter((a) => a.owner.toString() === oid).length > 1);

    return {
      data: {
        todayBookings: todayAppts.length,
        confirmedCount: confirmed,
        upcomingCount: pending,
        pendingEarnings,
        pendingEarningsLabel: `PKR ${pendingEarnings.toLocaleString()}`,
        pendingEarningsNote,
        thisMonth: monthTotal,
        thisMonthLabel: `PKR ${monthTotal.toLocaleString()}`,
        thisMonthBookings: monthBookings,
        thisMonthCommission: `PKR ${monthAppts.reduce((s, a) => s + a.platformCommission, 0).toLocaleString()} commission`,
        repeatClients: ownerIds.length > 0 ? `${Math.round((repeatOwners.length / ownerIds.length) * 100)}%` : '0%',
        repeatClientsSubtitle: 'returning this month',
      },
      message: 'Schedule stats retrieved',
    };
  }

  async getScheduleAppointments(
    vetId: string,
    range: { startDate?: string; endDate?: string },
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const today = karachiDateStr();
    const startDate = range.startDate ?? today;
    const endDate = range.endDate ?? startDate;

    if (endDate < startDate) {
      throw new BadRequestException({ message: 'endDate must not be before startDate', code: 'INVALID_DATE_RANGE' });
    }

    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1, timeSlot: 1 })
      .lean()
      .exec();

    const ownerMap = await this.loadOwnerMap(appts.map((a) => a.owner));

    const mapped = appts.map((a) => {
      const owner = ownerMap.get(a.owner.toString());
      return {
        id: a._id.toString(),
        patientId: a.pet.toString(),
        date: a.date,
        time: a.timeSlot,
        duration: '30 min',
        petName: a.petDetails.name,
        ownerName: owner?.name ?? 'Owner',
        ownerPhone: owner?.phone ?? null,
        visitType: 'checkup',
        status: this.toScheduleStatus(a.status),
        paymentMethod: a.paymentMethod,
        paymentStatus: a.paymentStatus,
        payoutLabel: toPayoutLabel(a.paymentStatus, a.payoutEligibleAt),
      };
    });

    return { data: mapped, message: 'Appointments retrieved' };
  }

  // Was previously (incorrectly) reading vetDetails.name/phone for "owner" fields — that's the
  // treating vet's own snapshot, not the pet owner's. Shared by getScheduleAppointments and
  // getClinicScheduleAppointments so both look up the real owner the same way.
  private async loadOwnerMap(ownerIds: Types.ObjectId[]): Promise<Map<string, { name: string; phone: string }>> {
    const uniqueIds = [...new Set(ownerIds.map((id) => id.toString()))];
    const owners = await this.userModel
      .find({ _id: { $in: uniqueIds } })
      .select('name phone')
      .lean()
      .exec();
    return new Map(owners.map((o) => [(o._id as Types.ObjectId).toString(), { name: o.name, phone: o.phone }]));
  }

  // admin_vet/manager only (see @ClinicRoles on the controller route) — same shape as
  // getScheduleStats but aggregated across every staff Vet in the clinic via
  // resolveClinicVetIds, not just the caller's own bookings. Established practice-management
  // platforms always pair a per-provider calendar with a front-desk/manager view like this one.
  async getClinicScheduleStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const { vetIds } = await this.resolveClinicVetIds(vetId);
    const today = karachiDateStr();
    const startOfMonth = karachiStartOfMonth();

    const [todayAppts, monthAppts] = await Promise.all([
      this.appointmentModel.find({ vet: { $in: vetIds }, date: today }).lean().exec(),
      this.appointmentModel.find({ vet: { $in: vetIds }, createdAt: { $gte: startOfMonth } }).lean().exec(),
    ]);

    const confirmed = todayAppts.filter((a) => a.status === 'confirmed' || a.status === 'in-progress').length;
    const pending = todayAppts.filter((a) => a.status === 'pending').length;
    const pendingEarnings = todayAppts.filter((a) => a.status !== 'cancelled').reduce((s, a) => s + a.vetPayout, 0);
    const monthBookings = monthAppts.length;
    const monthTotal = monthAppts.reduce((s, a) => s + a.fee, 0);

    const ownerIds = [...new Set(monthAppts.map((a) => a.owner.toString()))];
    const repeatOwners = ownerIds.filter((oid) => monthAppts.filter((a) => a.owner.toString() === oid).length > 1);

    return {
      data: {
        staffCount: vetIds.length,
        todayBookings: todayAppts.length,
        confirmedCount: confirmed,
        upcomingCount: pending,
        pendingEarnings,
        pendingEarningsLabel: `PKR ${pendingEarnings.toLocaleString()}`,
        thisMonth: monthTotal,
        thisMonthLabel: `PKR ${monthTotal.toLocaleString()}`,
        thisMonthBookings: monthBookings,
        thisMonthCommission: `PKR ${monthAppts.reduce((s, a) => s + a.platformCommission, 0).toLocaleString()} commission`,
        repeatClients: ownerIds.length > 0 ? `${Math.round((repeatOwners.length / ownerIds.length) * 100)}%` : '0%',
        repeatClientsSubtitle: 'returning this month',
      },
      message: 'Clinic schedule stats retrieved',
    };
  }

  // admin_vet/manager only — same as getScheduleAppointments but across every staff Vet in the
  // clinic, with each row tagged with which staff member it belongs to so a front-desk view can
  // tell whose patient is whose.
  async getClinicScheduleAppointments(
    vetId: string,
    range: { startDate?: string; endDate?: string },
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const { vetIds } = await this.resolveClinicVetIds(vetId);
    const today = karachiDateStr();
    const startDate = range.startDate ?? today;
    const endDate = range.endDate ?? startDate;

    if (endDate < startDate) {
      throw new BadRequestException({ message: 'endDate must not be before startDate', code: 'INVALID_DATE_RANGE' });
    }

    const appts = await this.appointmentModel
      .find({ vet: { $in: vetIds }, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1, timeSlot: 1 })
      .lean()
      .exec();

    const staffVets = await this.vetModel.find({ _id: { $in: vetIds } }).select('name').lean().exec();
    const staffNames = new Map(staffVets.map((v) => [(v._id as Types.ObjectId).toString(), v.name]));
    const ownerMap = await this.loadOwnerMap(appts.map((a) => a.owner));

    const mapped = appts.map((a) => {
      const owner = ownerMap.get(a.owner.toString());
      return {
        id: a._id.toString(),
        patientId: a.pet.toString(),
        date: a.date,
        time: a.timeSlot,
        duration: '30 min',
        petName: a.petDetails.name,
        ownerName: owner?.name ?? 'Owner',
        ownerPhone: owner?.phone ?? null,
        staffVetId: a.vet.toString(),
        staffVetName: staffNames.get(a.vet.toString()) ?? 'Unknown',
        visitType: 'checkup',
        status: this.toScheduleStatus(a.status),
        paymentMethod: a.paymentMethod,
        paymentStatus: a.paymentStatus,
        payoutLabel: toPayoutLabel(a.paymentStatus, a.payoutEligibleAt),
      };
    });

    return { data: mapped, message: 'Clinic appointments retrieved' };
  }

  // Maps the DB status enum ('pending'|'confirmed'|'in-progress'|'completed'|'cancelled'|'no-show'|'disputed') to the
  // camelCase vocabulary POST /vet/schedule/appointments/:id/status accepts, so GET and POST agree.
  private toScheduleStatus(
    status: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show' | 'disputed',
  ): string {
    if (status === 'in-progress') return 'inProgress';
    if (status === 'completed') return 'done';
    if (status === 'no-show') return 'noShow';
    return status;
  }

  async getNextPatient(vetId: string): Promise<ServiceResponse<Record<string, unknown> | null>> {
    const today = karachiDateStr();
    const now = karachiTimeStr();

    const next = await this.appointmentModel
      .findOne({ vet: new Types.ObjectId(vetId), date: today, timeSlot: { $gte: now }, status: { $in: ['confirmed', 'pending'] } })
      .sort({ timeSlot: 1 })
      .lean()
      .exec();

    if (!next) return { data: null, message: 'No upcoming patient' };

    const pet = await this.petModel.findById(next.pet).lean().exec();
    const owner = await this.userModel.findById(next.owner).lean().exec();

    const vaccinations = (pet?.vaccinations ?? []).map((v, idx) => ({
      id: (v as unknown as Record<string, unknown>)._id?.toString() ?? `vax-${idx}`,
      name: v.name,
      date: v.date,
      administeredBy: v.vetName,
      isDue: new Date(v.nextDue) <= new Date(),
    }));

    return {
      data: {
        name: pet?.name ?? next.petDetails.name,
        species: pet?.species ?? next.petDetails.species,
        age: pet?.dateOfBirth ? petAge(pet.dateOfBirth) : 'Unknown',
        weight: pet ? `${pet.weight} kg` : 'Unknown',
        ownerName: owner?.name ?? 'Owner',
        nextUpTime: next.timeSlot,
        upcomingVisitType: 'checkup',
        lastVisit: 'N/A',
        vaccinationsOnRecord: vaccinations.length,
        allergies: pet?.allergies ?? [],
        currentMeds: (pet?.currentMedications ?? []).join(', ') || 'None',
        vaccinations,
        ownerNote: next.notes ?? '',
      },
      message: 'Next patient retrieved',
    };
  }

  // ─── Patients ──────────────────────────────────────────

  async getPatients(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), status: { $in: ['confirmed', 'in-progress', 'completed'] } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const petIds = [...new Set(appts.map((a) => a.pet.toString()))];
    const pets = await this.petModel.find({ _id: { $in: petIds.map((id) => new Types.ObjectId(id)) } }).lean().exec();
    const ownerIds = [...new Set(pets.map((p) => p.owner.toString()))];
    const owners = await this.userModel.find({ _id: { $in: ownerIds.map((id) => new Types.ObjectId(id)) } }).lean().exec();
    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

    const mapped = pets.map((p) => {
      const owner = ownerMap.get(p.owner.toString());
      const lastAppt = appts.find((a) => a.pet.toString() === p._id.toString());
      const hasPendingVax = (p.vaccinations ?? []).some((v) => new Date(v.nextDue) <= new Date());

      return {
        id: p._id.toString(),
        petName: p.name,
        species: p.species,
        age: petAge(p.dateOfBirth),
        ownerName: owner?.name ?? 'Owner',
        ownerPhone: owner?.phone ?? '',
        lastVisit: lastAppt ? timeAgo(lastAppt.createdAt) : 'Never',
        nextDueLabel: hasPendingVax ? 'Vaccination due' : 'Up to date',
        dueStatus: hasPendingVax ? 'dueSoon' : 'upToDate',
      };
    });

    return { data: mapped, message: 'Patients retrieved' };
  }

  async getPatientStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), status: { $in: ['confirmed', 'in-progress', 'completed'] } })
      .lean()
      .exec();
    const petIds = [...new Set(appts.map((a) => a.pet.toString()))];
    const pets = await this.petModel.find({ _id: { $in: petIds.map((id) => new Types.ObjectId(id)) } }).lean().exec();

    const ownerVisits: Record<string, number> = {};
    for (const a of appts) {
      ownerVisits[a.owner.toString()] = (ownerVisits[a.owner.toString()] ?? 0) + 1;
    }
    const repeatCount = Object.values(ownerVisits).filter((v) => v > 1).length;
    const totalOwners = Object.keys(ownerVisits).length;

    const overdue = pets.filter((p) =>
      (p.vaccinations ?? []).some((v) => new Date(v.nextDue) < new Date()),
    ).length;

    return {
      data: {
        totalPatients: petIds.length,
        repeatVisitPercent: totalOwners > 0 ? `${Math.round((repeatCount / totalOwners) * 100)}%` : '0%',
        dueThisMonth: 0,
        dueThisMonthSubtitle: 'vaccinations due',
        overdue,
        overdueSubtitle: 'need follow-up',
      },
      message: 'Patient stats retrieved',
    };
  }

  async getPatientChart(vetId: string, petId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const pet = await this.petModel.findById(petId).lean().exec();
    if (!pet) throw new NotFoundException('Pet not found');

    const owner = await this.userModel.findById(pet.owner).lean().exec();
    const notes = await this.visitNoteModel.find({ pet: new Types.ObjectId(petId) }).sort({ createdAt: -1 }).lean().exec();
    const nextAppt = await this.appointmentModel
      .findOne({ pet: new Types.ObjectId(petId), vet: new Types.ObjectId(vetId), status: { $in: ['confirmed', 'pending'] } })
      .sort({ date: 1 })
      .lean()
      .exec();

    const todayStr = karachiDateStr();
    const hasPendingVax = (pet.vaccinations ?? []).some((v) => v.nextDue <= todayStr);
    const hasOverdue = (pet.vaccinations ?? []).some((v) => v.nextDue < todayStr);
    const nextApptOverdue = nextAppt
      ? karachiDateTimeToUTC(nextAppt.date, nextAppt.timeSlot) < new Date()
      : false;

    return {
      data: {
        petName: pet.name,
        species: pet.species,
        gender: pet.gender,
        age: petAge(pet.dateOfBirth),
        weight: `${pet.weight} kg`,
        dueLabel: hasOverdue ? 'Overdue' : hasPendingVax ? 'Due soon' : 'Up to date',
        dueStatus: hasOverdue ? 'overdue' : hasPendingVax ? 'dueSoon' : 'upToDate',
        ownerName: owner?.name ?? 'Owner',
        ownerPhone: owner?.phone ?? '',
        ownerArea: owner?.area ?? '',
        allergies: pet.allergies ?? [],
        nextAppointmentId: nextAppt ? (nextAppt._id as Types.ObjectId).toString() : '',
        nextAppointmentDate: nextAppt?.date ?? '',
        nextAppointmentTime: nextAppt?.timeSlot ?? '',
        nextAppointmentType: 'checkup',
        nextAppointmentOverdue: nextApptOverdue,
        visitHistory: notes.map((n) => ({
          id: n._id.toString(),
          title: n.title,
          notes: n.notes,
          recordedBy: n.recordedBy,
          date: karachiDateStr(n.createdAt),
        })),
      },
      message: 'Patient chart retrieved',
    };
  }

  async addVisitNote(vetId: string, petId: string, dto: AddVisitNoteDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    await this.visitNoteModel.create({
      pet: new Types.ObjectId(petId),
      vet: new Types.ObjectId(vetId),
      title: dto.title,
      notes: dto.notes,
      recordedBy: vet?.name ?? 'Vet',
    });
    return { data: null, message: 'Note added' };
  }

  // ─── Reviews ──────────────────────────────────────────

  async getReviews(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const reviews = await this.reviewModel.find({ vet: new Types.ObjectId(vetId) }).sort({ createdAt: -1 }).lean().exec();

    const mapped = reviews.map((r) => ({
      id: r._id.toString(),
      reviewerName: r.reviewerName ?? 'User',
      reviewerInitial: getInitials(r.reviewerName ?? 'U'),
      reviewerColor: getColor(r.reviewerName ?? 'U'),
      petName: r.petName ?? r.petType,
      timeAgo: timeAgo(r.createdAt),
      rating: r.rating,
      text: r.comment ?? '',
      reply: r.reply,
    }));

    return { data: mapped, message: 'Reviews retrieved' };
  }

  async getReviewSummary(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const reviews = await this.reviewModel.find({ vet: new Types.ObjectId(vetId) }).lean().exec();
    const total = reviews.length;
    const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
    const fiveStars = reviews.filter((r) => r.rating >= 4).length;

    const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      percent: total > 0 ? Math.round((reviews.filter((r) => r.rating === stars).length / total) * 100) : 0,
    }));

    return {
      data: {
        averageRating: Math.round(avg * 10) / 10,
        totalReviews: total,
        breakdown,
        recommendPercent: total > 0 ? Math.round((fiveStars / total) * 100) : 0,
      },
      message: 'Review summary retrieved',
    };
  }

  async replyToReview(reviewId: string, dto: ReplyReviewDto): Promise<ServiceResponse<null>> {
    const review = await this.reviewModel.findByIdAndUpdate(reviewId, { reply: dto.text }).exec();
    if (!review) throw new NotFoundException('Review not found');
    return { data: null, message: 'Reply posted' };
  }

  // ─── Earnings ──────────────────────────────────────────

  async getEarningsStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vid = new Types.ObjectId(vetId);
    const appts = await this.appointmentModel.find({ vet: vid, status: 'completed' }).lean().exec();
    const vet = await this.vetModel.findById(vetId).lean().exec();

    const totalEarned = appts.reduce((s, a) => s + a.vetPayout, 0);
    const ownerVisits: Record<string, number> = {};
    for (const a of appts) ownerVisits[a.owner.toString()] = (ownerVisits[a.owner.toString()] ?? 0) + 1;
    const repeatCount = Object.values(ownerVisits).filter((v) => v > 1).length;
    const totalOwners = Object.keys(ownerVisits).length;

    return {
      data: {
        totalEarned: `PKR ${totalEarned.toLocaleString()}`,
        totalEarnedChange: 0,
        totalEarnedSubtitle: 'lifetime earnings',
        bookings: appts.length,
        bookingsChange: 0,
        bookingsSubtitle: 'completed',
        repeatClients: totalOwners > 0 ? `${Math.round((repeatCount / totalOwners) * 100)}%` : '0%',
        repeatClientsChange: '0%',
        repeatClientsSubtitle: 'return rate',
        avgRating: vet?.rating ?? 0,
        avgRatingReviews: vet?.reviewCount ?? 0,
      },
      message: 'Earnings stats retrieved',
    };
  }

  async getMonthlyEarnings(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = new Date().getFullYear();
    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), status: 'completed', createdAt: { $gte: new Date(year, 0, 1) } })
      .lean()
      .exec();

    const monthlyMap: Record<number, number> = {};
    for (const a of appts) {
      const m = a.createdAt.getMonth();
      monthlyMap[m] = (monthlyMap[m] ?? 0) + a.vetPayout;
    }

    const data = months.map((month, i) => ({ month, amount: monthlyMap[i] ?? 0 }));
    return { data, message: 'Monthly earnings retrieved' };
  }

  async getPeakHours(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const appts = await this.appointmentModel.find({ vet: new Types.ObjectId(vetId) }).lean().exec();
    const hourCounts: Record<string, number> = {};

    for (const a of appts) {
      const hour = a.timeSlot.slice(0, 2) + ':00';
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    }

    const maxCount = Math.max(...Object.values(hourCounts), 0);
    const data = Object.entries(hourCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count, isPeak: count >= maxCount * 0.8 }));

    return { data, message: 'Peak hours retrieved' };
  }

  async getPetTypes(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const appts = await this.appointmentModel.find({ vet: new Types.ObjectId(vetId) }).lean().exec();
    const petIds = [...new Set(appts.map((a) => a.pet.toString()))];
    const pets = await this.petModel.find({ _id: { $in: petIds.map((id) => new Types.ObjectId(id)) } }).lean().exec();

    const speciesCounts: Record<string, number> = {};
    for (const p of pets) speciesCounts[p.species] = (speciesCounts[p.species] ?? 0) + 1;

    const total = pets.length || 1;
    const data = Object.entries(speciesCounts).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      percentage: Math.round((count / total) * 100),
    }));

    return { data, message: 'Pet types retrieved' };
  }

  // ─── Payouts ──────────────────────────────────────────

  // Payout activity belongs to the clinic, not to whichever individual staff vet happens to be
  // logged in — always resolve to the clinic's canonical adminVetId so admin_vet and manager
  // see the same shared history regardless of who's viewing it.
  async getPayouts(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const { adminVetId } = await this.resolveClinicVetIds(vetId);
    const payouts = await this.payoutModel
      .find({ entityId: adminVetId, entityType: 'vet' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const mapped = payouts.map((p) => ({
      id: p._id.toString(),
      label: p.label,
      date: p.date,
      method: p.method,
      amount: `PKR ${p.amount.toLocaleString()}`,
      status: p.status,
    }));

    return { data: mapped, message: 'Payouts retrieved' };
  }

  async getPayoutSummary(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const { vetIds } = await this.resolveClinicVetIds(vetId);

    const [completedAppts, completedConsults] = await Promise.all([
      this.appointmentModel
        .find({ vet: { $in: vetIds }, status: 'completed', paymentStatus: 'released', payoutId: null })
        .lean()
        .exec(),
      this.consultationModel
        .find({ vet: { $in: vetIds }, status: { $in: ['closed', 'expired'] }, payoutId: null })
        .lean()
        .exec(),
    ]);
    const available =
      completedAppts.reduce((s, a) => s + a.vetPayout, 0) + completedConsults.reduce((s, c) => s + c.vetPayout, 0);

    // "held" mirrors appointments' held-escrow bucket — a disputed appointment/consultation is
    // excluded from both buckets, same as before, since it's only visible via the admin dispute queue.
    const [heldAppts, heldConsults] = await Promise.all([
      this.appointmentModel
        .find({ vet: { $in: vetIds }, status: 'completed', paymentStatus: 'held' })
        .lean()
        .exec(),
      this.consultationModel.find({ vet: { $in: vetIds }, status: 'active' }).lean().exec(),
    ]);
    const held = heldAppts.reduce((s, a) => s + a.vetPayout, 0) + heldConsults.reduce((s, c) => s + c.vetPayout, 0);

    return {
      data: { availableToWithdraw: available, heldInEscrow: held, nextAutoPayout: 'Monday' },
      message: 'Payout summary retrieved',
    };
  }

  async getPayoutAccount(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const clinic = vet.clinicId ? await this.clinicModel.findById(vet.clinicId).lean().exec() : null;
    const account = payoutAccountValue(clinic);
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;
    const label = payoutMethodLabel(clinic?.payoutMethod, clinic?.bankName);

    return {
      data: {
        label,
        initials: getInitials(label),
        maskedNumber: masked,
        accountName: clinic?.accountTitle ?? vet.name,
        commissionNote: `Platform commission applied`,
      },
      message: 'Payout account retrieved',
    };
  }

  // ─── Team ──────────────────────────────────────────────

  private staffRoleLabel(staffRole: 'admin_vet' | 'team_vet' | 'manager' | null): string {
    if (staffRole === 'team_vet') return 'Veterinarian';
    if (staffRole === 'manager') return 'Manager';
    return 'Admin / Veterinarian'; // 'admin_vet' or legacy solo vet (null)
  }

  // Resolves the clinic-mates of a calling vet. Falls back to solo-vet behavior
  // (just themselves) when they have no clinicId yet, so legacy vets are unaffected.
  private async resolveClinicVetIds(
    vetId: string,
  ): Promise<{ clinicId: Types.ObjectId | null; vetIds: Types.ObjectId[]; adminVetId: Types.ObjectId }> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    if (!vet.clinicId) {
      const selfId = vet._id as Types.ObjectId;
      return { clinicId: null, vetIds: [selfId], adminVetId: selfId };
    }

    const [clinic, clinicMates] = await Promise.all([
      this.clinicModel.findById(vet.clinicId).lean().exec(),
      this.vetModel.find({ clinicId: vet.clinicId }).lean().exec(),
    ]);

    return {
      clinicId: vet.clinicId as Types.ObjectId,
      vetIds: clinicMates.map((v) => v._id as Types.ObjectId),
      adminVetId: (clinic?.ownerId as Types.ObjectId) ?? (vet._id as Types.ObjectId),
    };
  }

  async getTeam(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const { vetIds, adminVetId } = await this.resolveClinicVetIds(vetId);
    const clinicVets = await this.vetModel.find({ _id: { $in: vetIds } }).lean().exec();

    const members: Record<string, unknown>[] = clinicVets.map((v) => ({
      id: v._id.toString(),
      name: v.name,
      subtitle: v.specialty ?? 'Veterinarian',
      role: v.staffRole ?? 'admin_vet',
      roleLabel: this.staffRoleLabel(v.staffRole),
      patients: null,
      rating: v.rating,
      status: 'active',
      isYou: v._id.toString() === vetId,
    }));

    const invites = await this.inviteModel
      .find({ entityId: adminVetId, entityType: 'vet', status: 'pending' })
      .lean()
      .exec();

    for (const inv of invites) {
      const inviteRole = inv.role === 'manager' ? 'manager' : 'team_vet';
      members.push({
        id: inv._id.toString(),
        name: inv.inviteeName,
        subtitle: inv.role,
        role: inviteRole,
        roleLabel: this.staffRoleLabel(inviteRole),
        patients: null,
        rating: null,
        status: 'invited',
        isYou: false,
      });
    }

    return { data: members, message: 'Team retrieved' };
  }

  async getTeamStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const { vetIds, adminVetId } = await this.resolveClinicVetIds(vetId);

    const [clinicVets, adminVet, invites] = await Promise.all([
      this.vetModel.find({ _id: { $in: vetIds } }).lean().exec(),
      this.vetModel.findById(adminVetId).lean().exec(),
      this.inviteModel.countDocuments({ entityId: adminVetId, entityType: 'vet', status: 'pending' }),
    ]);

    const veterinarians = clinicVets.filter((v) => v.staffRole !== 'manager').length;
    const managerCount = clinicVets.filter((v) => v.staffRole === 'manager').length;

    return {
      data: {
        veterinarians,
        vetSubtitle: 'practicing',
        managers: managerCount,
        adminSubtitle: 'clinic staff',
        pendingInvites: invites,
        pendingSubtitle: 'awaiting response',
        clinicRating: adminVet?.rating ?? 0,
        ratingSubtitle: `${adminVet?.reviewCount ?? 0} reviews`,
      },
      message: 'Team stats retrieved',
    };
  }

  async inviteTeamMember(vetId: string, dto: InviteTeamMemberDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');
    // Defense-in-depth: primary enforcement is @ClinicRoles('admin_vet') on the route.
    if (vet.staffRole && vet.staffRole !== 'admin_vet') {
      throw new ForbiddenException({ message: 'Only the clinic admin can invite team members', code: 'FORBIDDEN' });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const isEmail = dto.emailOrPhone.includes('@');
    const inviteEmail = isEmail ? dto.emailOrPhone : null;
    const invitePhone = isEmail ? null : dto.emailOrPhone;

    await this.inviteModel.create({
      token,
      entityType: 'vet',
      entityId: new Types.ObjectId(vetId),
      entityName: vet.clinicName,
      entityArea: vet.area,
      inviterName: vet.name,
      inviteeName: dto.emailOrPhone,
      role: dto.role,
      phone: invitePhone,
      email: inviteEmail,
      status: 'pending',
      expiresAt,
    });

    // Phone-only invites have no delivery channel yet (no SMS invite path exists) — the invitee
    // only finds out if the link is shared with them some other way.
    if (inviteEmail) {
      await this.emailService.sendTeamInviteEmail(
        inviteEmail,
        inviteEmail,
        vet.name,
        vet.clinicName,
        dto.role,
        token,
        'vet',
      );
    }

    return { data: null, message: 'Invite sent' };
  }

  async removeTeamMember(memberId: string): Promise<ServiceResponse<null>> {
    await this.inviteModel.findByIdAndDelete(memberId).exec();
    return { data: null, message: 'Team member removed' };
  }

  // ─── Listings ──────────────────────────────────────────

  async getListings(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const listings = await this.listingModel.find({ vet: new Types.ObjectId(vetId) }).sort({ createdAt: -1 }).lean().exec();

    const mapped = listings.map((l) => {
      return {
        id: l._id.toString(),
        name: l.name,
        category: l.category,
        categoryLabel: getCategoryLabel(l.category),
        price: l.price,
        inStock: l.inStock,
        sold: l.sold,
        status: l.status,
      };
    });

    return { data: mapped, message: 'Listings retrieved' };
  }

  async getListingStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const listings = await this.listingModel.find({ vet: new Types.ObjectId(vetId) }).lean().exec();
    const active = listings.filter((l) => l.status === 'active').length;
    const totalSold = listings.reduce((s, l) => s + l.sold, 0);
    const revenue = listings.reduce((s, l) => s + l.sold * l.price, 0);

    return {
      data: {
        activeListings: active,
        totalListings: listings.length,
        unitsSold: totalSold,
        listingRevenue: revenue,
      },
      message: 'Listing stats retrieved',
    };
  }

  async createListing(vetId: string, dto: CreateListingDto, photo?: Express.Multer.File): Promise<ServiceResponse<null>> {
    await this.listingModel.create({
      vet: new Types.ObjectId(vetId),
      name: dto.name,
      price: parseInt(dto.price, 10) || 0,
      category: dto.category.toLowerCase(),
      ...(photo ? { photo: photo.originalname } : {}),
    });
    return { data: null, message: 'Listing created' };
  }

  async updateListing(vetId: string, listingId: string, dto: UpdateListingDto): Promise<ServiceResponse<null>> {
    const updated = await this.listingModel.findOneAndUpdate(
      { _id: new Types.ObjectId(listingId), vet: new Types.ObjectId(vetId) },
      { $set: dto },
    ).exec();
    if (!updated) throw new NotFoundException('Listing not found');
    return { data: null, message: 'Listing updated' };
  }

  async toggleListing(vetId: string, listingId: string): Promise<ServiceResponse<null>> {
    const listing = await this.listingModel.findOne({ _id: new Types.ObjectId(listingId), vet: new Types.ObjectId(vetId) }).exec();
    if (!listing) throw new NotFoundException('Listing not found');
    listing.status = listing.status === 'active' ? 'hidden' : 'active';
    await listing.save();
    return { data: null, message: 'Listing toggled' };
  }

  // ─── Clinic Settings ──────────────────────────────────

  private async requireClinicId(vetId: string): Promise<Types.ObjectId> {
    const vet = await this.vetModel.findById(vetId).select('clinicId').lean().exec();
    if (!vet?.clinicId) {
      throw new BadRequestException({ message: 'No clinic is set up for this account', code: 'CLINIC_NOT_FOUND' });
    }
    return vet.clinicId as Types.ObjectId;
  }

  // Writes one immutable audit entry per payout-account change — who, from what, to what.
  // Called from both places a clinic's payout account can be written (clinic-settings PUT and
  // the dedicated payout POST) so neither path can silently skip the trail.
  private async recordPayoutAccountChange(
    clinicId: Types.ObjectId,
    actingVetId: string,
    actingVetName: string,
    actingStaffRole: 'admin_vet' | 'team_vet' | 'manager' | null | undefined,
    previous: Pick<Clinic, 'payoutMethod' | 'accountTitle' | 'walletNumber' | 'bankName' | 'accountNumber'> | null,
    next: {
      payoutMethod: PayoutMethod;
      accountTitle: string;
      walletNumber: string | null;
      bankName: string | null;
      accountNumber: string | null;
    },
  ): Promise<void> {
    await this.payoutAccountAuditModel.create({
      entityId: clinicId,
      entityType: 'vet',
      changedBy: new Types.ObjectId(actingVetId),
      changedByName: actingVetName,
      changedByRole: actingStaffRole ?? null,
      previousValues: previous
        ? {
            payoutMethod: previous.payoutMethod,
            accountTitle: previous.accountTitle,
            walletNumber: previous.walletNumber,
            bankName: previous.bankName,
            accountNumber: previous.accountNumber,
          }
        : null,
      newValues: next,
    });
  }

  async getPayoutAccountHistory(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const clinicId = await this.requireClinicId(vetId);
    const entries = await this.payoutAccountAuditModel
      .find({ entityId: clinicId, entityType: 'vet' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      data: entries.map((e) => ({
        id: e._id.toString(),
        changedByName: e.changedByName,
        changedByRole: e.changedByRole,
        previousMethod: e.previousValues ? payoutMethodLabel(e.previousValues.payoutMethod, e.previousValues.bankName) : null,
        previousMasked: e.previousValues ? maskPayoutValue(e.previousValues) : null,
        newMethod: payoutMethodLabel(e.newValues.payoutMethod, e.newValues.bankName),
        newMasked: maskPayoutValue(e.newValues),
        changedAt: e.createdAt,
      })),
      message: 'Payout account history retrieved',
    };
  }

  // Merges the payout-account audit trail with the payout lifecycle (requested → settled) into
  // one chronological feed — "who changed the account" and "who requested/settled money" are
  // two different collections under the hood but one story for the clinic owner reading it.
  async getPayoutActivity(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const { clinicId, adminVetId } = await this.resolveClinicVetIds(vetId);
    if (!clinicId) {
      throw new BadRequestException({ message: 'No clinic is set up for this account', code: 'CLINIC_NOT_FOUND' });
    }

    const [accountChanges, payouts] = await Promise.all([
      this.payoutAccountAuditModel.find({ entityId: clinicId, entityType: 'vet' }).lean().exec(),
      this.payoutModel.find({ entityId: adminVetId, entityType: 'vet' }).lean().exec(),
    ]);

    const requesterIds = payouts.filter((p) => p.requestedBy).map((p) => p.requestedBy as Types.ObjectId);
    const settlerIds = payouts.filter((p) => p.settledBy).map((p) => p.settledBy as Types.ObjectId);
    const emptyNamed: { _id: Types.ObjectId; name: string }[] = [];
    const [requesters, settlers] = await Promise.all([
      requesterIds.length ? this.vetModel.find({ _id: { $in: requesterIds } }).select('name').lean().exec() : emptyNamed,
      settlerIds.length ? this.userModel.find({ _id: { $in: settlerIds } }).select('name').lean().exec() : emptyNamed,
    ]);
    const requesterNames = new Map(
      requesters.map((v: { _id: Types.ObjectId; name: string }): [string, string] => [v._id.toString(), v.name]),
    );
    const settlerNames = new Map(
      settlers.map((u: { _id: Types.ObjectId; name: string }): [string, string] => [u._id.toString(), u.name]),
    );

    const events: { id: string; type: string; summary: string; actor: string | null; occurredAt: Date }[] = [];

    for (const e of accountChanges) {
      events.push({
        id: e._id.toString(),
        type: 'account_updated',
        summary: e.previousValues
          ? `Payout account changed from ${payoutMethodLabel(e.previousValues.payoutMethod, e.previousValues.bankName)} to ${payoutMethodLabel(e.newValues.payoutMethod, e.newValues.bankName)}`
          : `Payout account set up (${payoutMethodLabel(e.newValues.payoutMethod, e.newValues.bankName)})`,
        actor: e.changedByName,
        occurredAt: e.createdAt,
      });
    }

    for (const p of payouts) {
      events.push({
        id: `${p._id.toString()}-requested`,
        type: 'payout_requested',
        summary: `Payout requested — PKR ${p.amount.toLocaleString()} (${p.orders} appointment${p.orders === 1 ? '' : 's'})`,
        actor: p.requestedBy ? (requesterNames.get(p.requestedBy.toString()) ?? null) : 'Weekly auto-batch',
        occurredAt: p.createdAt,
      });

      if (p.status === 'completed' && p.settledAt) {
        events.push({
          id: `${p._id.toString()}-settled`,
          type: 'payout_settled',
          summary: `Payout settled — PKR ${p.amount.toLocaleString()}${p.transactionReference ? ` (ref: ${p.transactionReference})` : ''}`,
          actor: p.settledBy ? (settlerNames.get(p.settledBy.toString()) ?? null) : null,
          occurredAt: p.settledAt,
        });
      }
    }

    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return { data: events, message: 'Payout activity retrieved' };
  }

  async getClinicSettings(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const clinic = vet.clinicId ? await this.clinicModel.findById(vet.clinicId).lean().exec() : null;
    const account = payoutAccountValue(clinic);
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;

    const workingDays: string[] = [];
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
    for (const d of days) {
      if (vet.workingHours?.[d]?.isOpen) workingDays.push(d.charAt(0).toUpperCase() + d.slice(1));
    }

    return {
      data: {
        profile: {
          clinicName: vet.clinicName,
          phone: vet.phone,
          fullAddress: vet.address,
          city: vet.city,
          area: vet.area,
        },
        consultation: {
          inPersonFee: `${vet.fee.min}`,
          videoConsultFee: `${vet.fee.max}`,
          textConsultFee: vet.textConsultFee != null ? `${vet.textConsultFee}` : '',
          inPersonEnabled: vet.inPersonEnabled ?? true,
          videoEnabled: vet.videoEnabled ?? false,
          textEnabled: vet.textEnabled ?? false,
        },
        availability: {
          workingDays,
          opens: vet.workingHours?.mon?.open ?? '09:00',
          closes: vet.workingHours?.mon?.close ?? '18:00',
          slotLength: vet.slotLength ?? '30min',
          lunchStart: vet.lunchStart ?? '13:00',
          lunchEnd: vet.lunchEnd ?? '14:00',
          bookableSlotsPerDay: 16,
        },
        payout: {
          method: clinic?.payoutMethod ?? 'jazzcash',
          methodInitials: getInitials(payoutMethodLabel(clinic?.payoutMethod, clinic?.bankName)),
          accountHolder: clinic?.accountTitle ?? vet.name,
          bankName: clinic?.bankName ?? null,
          maskedNumber: masked,
          commissionRate: '10%', // matches PLATFORM_COMMISSION_RATE/CONSULTATION_COMMISSION_RATE — update together
          commissionLabel: 'Platform commission on bookings',
        },
        notifications: (vet.notifications ?? [
          { id: 'new-booking', enabled: true },
          { id: 'cancellation', enabled: true },
          { id: 'review', enabled: true },
          { id: 'payout', enabled: true },
        ]).map((n) => ({ id: n.id, enabled: n.enabled })),
      },
      message: 'Clinic settings retrieved',
    };
  }

  async updateClinicSettings(user: JwtPayload, dto: UpdateClinicSettingsDto): Promise<ServiceResponse<null>> {
    const vetId = user.sub;
    const vet = await this.vetModel.findById(vetId).exec();
    if (!vet) throw new NotFoundException('Vet not found');

    if (
      dto.payout &&
      user.staffRole &&
      !['admin_vet', 'manager'].includes(user.staffRole)
    ) {
      throw new ForbiddenException({
        message: 'Only the clinic admin or manager can update payout details',
        code: 'FORBIDDEN',
      });
    }

    // Business identity (clinic name/phone/address) — admin_vet/manager owned, same gate as
    // payout above. Personal identity (name/photo/about/specialty) lives on /vet/profile/me
    // instead, which every staff member can edit for themselves regardless of staffRole.
    if (
      dto.profile &&
      user.staffRole &&
      !['admin_vet', 'manager'].includes(user.staffRole)
    ) {
      throw new ForbiddenException({
        message:
          'Only the clinic admin or manager can update clinic profile details',
        code: 'FORBIDDEN',
      });
    }

    // Consultation fees and availability are clinic-wide (they apply to the whole clinic's
    // booking surface, not just the calling vet), so they're admin_vet/manager owned too —
    // same gate as profile/payout above. A team_vet must not be able to change what the whole
    // clinic charges or when it's open.
    if (
      dto.consultation &&
      user.staffRole &&
      !['admin_vet', 'manager'].includes(user.staffRole)
    ) {
      throw new ForbiddenException({
        message:
          'Only the clinic admin or manager can update consultation fees',
        code: 'FORBIDDEN',
      });
    }
    if (
      dto.availability &&
      user.staffRole &&
      !['admin_vet', 'manager'].includes(user.staffRole)
    ) {
      throw new ForbiddenException({
        message:
          'Only the clinic admin or manager can update clinic availability',
        code: 'FORBIDDEN',
      });
    }

    if (dto.profile) {
      vet.clinicName = dto.profile.clinicName;
      vet.phone = dto.profile.phone;
      vet.address = dto.profile.fullAddress;
      vet.city = dto.profile.city;
      vet.area = dto.profile.area;
      vet.location = {
        type: 'Point',
        coordinates: [dto.profile.lng, dto.profile.lat],
      };
    }

    if (dto.consultation) {
      vet.fee = {
        min: parseInt(dto.consultation.inPersonFee, 10) || vet.fee.min,
        max: parseInt(dto.consultation.videoConsultFee, 10) || vet.fee.max,
      };
      if (dto.consultation.textConsultFee !== undefined) {
        vet.textConsultFee = parseInt(dto.consultation.textConsultFee, 10) || null;
      }
      vet.inPersonEnabled = dto.consultation.inPersonEnabled;
      vet.videoEnabled = dto.consultation.videoEnabled;
      vet.textEnabled = dto.consultation.textEnabled;
    }

    if (dto.availability) {
      const dayMap: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
        Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
      };
      const allDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
      const activeDays = new Set(dto.availability.workingDays.map((d) => dayMap[d] ?? d.toLowerCase()));

      const updatedHours: Record<string, { open: string; close: string; isOpen: boolean }> = {};
      for (const day of allDays) {
        updatedHours[day] = {
          open: activeDays.has(day) ? dto.availability.opens : vet.workingHours[day].open,
          close: activeDays.has(day) ? dto.availability.closes : vet.workingHours[day].close,
          isOpen: activeDays.has(day),
        };
      }
      vet.workingHours = updatedHours as unknown as typeof vet.workingHours;
      vet.markModified('workingHours');

      vet.slotLength = dto.availability.slotLength;
      vet.lunchStart = dto.availability.lunchStart;
      vet.lunchEnd = dto.availability.lunchEnd;
    }

    if (dto.payout) {
      const clinicId = await this.requireClinicId(vetId);
      const isBank = dto.payout.method === 'bank_transfer';
      const previous = await this.clinicModel.findById(clinicId).lean().exec();
      const nextValues = {
        payoutMethod: dto.payout.method,
        accountTitle: dto.payout.accountHolder,
        walletNumber: isBank ? null : (dto.payout.walletNumber ?? null),
        bankName: isBank ? (dto.payout.bankName ?? null) : null,
        accountNumber: isBank ? (dto.payout.accountNumber ?? null) : null,
      };
      await this.clinicModel.findByIdAndUpdate(clinicId, nextValues).exec();
      await this.recordPayoutAccountChange(clinicId, vetId, vet.name, user.staffRole, previous, nextValues);
    }

    if (dto.notifications) {
      vet.notifications = dto.notifications;
      vet.markModified('notifications');
    }

    await vet.save();

    // Cascade business identity to every other staff Vet document in the same clinic, so the
    // whole clinic stays in sync with whatever admin_vet/manager just set here — the gate above
    // already ensures only they can reach this point. A solo vet (no clinic-mates) is a no-op.
    if (dto.profile) {
      const { vetIds } = await this.resolveClinicVetIds(vetId);
      const clinicMateIds = vetIds.filter((id) => id.toString() !== vetId);
      if (clinicMateIds.length > 0) {
        await this.vetModel
          .updateMany(
            { _id: { $in: clinicMateIds } },
            {
              $set: {
                clinicName: dto.profile.clinicName,
                phone: dto.profile.phone,
                address: dto.profile.fullAddress,
                city: dto.profile.city,
                area: dto.profile.area,
                location: {
                  type: 'Point',
                  coordinates: [dto.profile.lng, dto.profile.lat],
                },
              },
            },
          )
          .exec();
      }
    }

    return { data: null, message: 'Settings updated' };
  }

  // ─── Availability ─────────────────────────────────────

  async getAvailability(vetId: string, dateParam?: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const todayStr = karachiDateStr();
    const refDateStr = dateParam ?? todayStr;
    // Build every date as a synthetic UTC-midnight instant from explicit y/m/d components, and
    // only ever read it back with the UTC getters — this makes the whole week computation
    // independent of the host process's local timezone (see karachi-time.util.ts).
    const [refYear, refMonth, refDay] = refDateStr.split('-').map(Number);
    const refUTC = Date.UTC(refYear, refMonth - 1, refDay);
    const monthName = new Date(refUTC).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const refDayOfWeek = new Date(refUTC).getUTCDay();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startOfWeekUTC = refUTC - (refDayOfWeek === 0 ? 6 : refDayOfWeek - 1) * DAY_MS;
    const endOfWeekUTC = startOfWeekUTC + 6 * DAY_MS;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeekUTC + i * DAY_MS);
      const fullDate = d.toISOString().slice(0, 10);
      return {
        day: dayNames[d.getUTCDay()],
        date: d.getUTCDate(),
        fullDate,
        isActive: fullDate === todayStr,
        isOff: d.getUTCDay() === 0,
      };
    });

    const activeDay = dateParam ?? weekDays.find((d) => d.isActive)?.fullDate ?? todayStr;
    const [todayAppts, activeReservations] = await Promise.all([
      this.appointmentModel
        .find({ vet: new Types.ObjectId(vetId), date: activeDay })
        .lean()
        .exec(),
      // Safepay reservations mid-checkout soft-lock a slot too, even though no real
      // Appointment exists yet — otherwise the vet's grid would show it as free.
      this.reservationModel
        .find({
          vet: new Types.ObjectId(vetId),
          date: activeDay,
          expiresAt: { $gt: new Date() },
        })
        .select('timeSlot')
        .lean()
        .exec(),
    ]);
    const bookedSlots = new Set([
      ...todayAppts.map((a) => a.timeSlot),
      ...activeReservations.map((r) => r.timeSlot),
    ]);

    const weekStart = new Date(startOfWeekUTC).toISOString().slice(0, 10);
    const weekEnd = new Date(endOfWeekUTC).toISOString().slice(0, 10);
    const timeOffs = await this.timeOffModel
      .find({ vet: new Types.ObjectId(vetId), date: { $gte: weekStart, $lte: weekEnd } })
      .sort({ date: 1 })
      .lean()
      .exec();
    const blockedDates = new Set(timeOffs.map((t) => t.date));

    const blockedSlotDocs = await this.blockedSlotModel
      .find({ vet: new Types.ObjectId(vetId), date: activeDay })
      .lean()
      .exec();
    const blockedSlotIds = new Set(blockedSlotDocs.map((b) => b.slotId));

    const vet = await this.vetModel.findById(vetId).lean().exec();
    const opens = vet?.workingHours?.mon?.open ?? '09:00';
    const closes = vet?.workingHours?.mon?.close ?? '18:00';
    const slotMinutes = parseInt(vet?.slotLength ?? '30', 10) || 30;
    const lunchStart = vet?.lunchStart ?? '13:00';
    const lunchEnd = vet?.lunchEnd ?? '14:00';

    const toMinutes = (t: string): number => {
      const trimmed = t.trim().toUpperCase();
      const isPM = trimmed.includes('PM');
      const isAM = trimmed.includes('AM');
      const clean = trimmed.replace(/\s*(AM|PM)\s*/i, '');
      const [h, m] = clean.split(':').map(Number);
      let hour = h;
      if (isPM && hour < 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };
    const fromMinutes = (mins: number): string => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const startMin = toMinutes(opens);
    const endMin = toMinutes(closes);
    const lunchStartMin = toMinutes(lunchStart);
    const lunchEndMin = toMinutes(lunchEnd);

    const slots: Record<string, unknown>[] = [];
    const isBlocked = blockedDates.has(activeDay);
    const breakTime = `${fromMinutes(lunchStartMin)}-${fromMinutes(lunchEndMin)}`;

    const pushSlot = (time: string, status: string) => {
      const isBooked = bookedSlots.has(time);
      const isSlotBlocked = blockedSlotIds.has(`slot-${time}`);
      const finalStatus = isBlocked ? 'blocked' : status === 'break' ? 'break' : isSlotBlocked ? 'blocked' : isBooked ? 'booked' : 'available';
      slots.push({
        id: `slot-${time}`,
        time,
        status: finalStatus,
        ...(isBooked && finalStatus === 'booked' && todayAppts.find((a) => a.timeSlot === time)
          ? { label: todayAppts.find((a) => a.timeSlot === time)?.petDetails.name }
          : {}),
      });
    };

    if (slotMinutes === 45) {
      let min = startMin;
      let breakInserted = false;

      while (true) {
        if (!breakInserted && min >= lunchStartMin) {
          pushSlot(breakTime, 'break');
          breakInserted = true;
          min = lunchEndMin;
          continue;
        }

        if (!breakInserted && min + slotMinutes > lunchStartMin) {
          const overlap = min + slotMinutes - lunchStartMin;
          if (overlap < 5) {
            pushSlot(fromMinutes(min), 'available');
          } else {
            pushSlot(fromMinutes(min), 'available');
          }
          pushSlot(breakTime, 'break');
          breakInserted = true;
          min = lunchEndMin;
          continue;
        }

        if (min >= endMin) {
          const spare = min - endMin;
          if (spare >= 30) break;
          if (min >= endMin + slotMinutes) break;
        }

        if (min > endMin + slotMinutes) break;

        pushSlot(fromMinutes(min), 'available');
        min += slotMinutes;
      }
    } else {
      let min = startMin;
      let breakInserted = false;

      while (min < endMin) {
        if (!breakInserted && min >= lunchStartMin) {
          pushSlot(breakTime, 'break');
          breakInserted = true;
          min = lunchEndMin;
          continue;
        }

        if (min >= lunchStartMin && min < lunchEndMin) {
          if (!breakInserted) {
            pushSlot(breakTime, 'break');
            breakInserted = true;
          }
          min = lunchEndMin;
          continue;
        }

        pushSlot(fromMinutes(min), 'available');
        min += slotMinutes;
      }
    }

    const booked = slots.filter((s) => s.status === 'booked').length;
    const available = slots.filter((s) => s.status === 'available').length;
    const blocked = slots.filter((s) => s.status === 'blocked').length;

    return {
      data: {
        month: monthName,
        weekDays,
        slots,
        summary: { dateLabel: 'Today', booked, available, blocked },
        upcomingTimeOff: timeOffs.map((t) => ({
          id: t._id.toString(),
          dateLabel: t.dateLabel,
          reason: t.reason,
        })),
      },
      message: 'Availability retrieved',
    };
  }

  async blockSlots(vetId: string, dto: BlockSlotsDto): Promise<ServiceResponse<null>> {
    const vid = new Types.ObjectId(vetId);

    const todayAppts = await this.appointmentModel
      .find({ vet: vid, date: dto.date, status: { $in: ['pending', 'confirmed'] } })
      .lean()
      .exec();
    const bookedTimes = new Set(todayAppts.map((a) => `slot-${a.timeSlot}`));

    const conflicting = dto.slotIds.filter((id) => bookedTimes.has(id));
    if (conflicting.length > 0) {
      const times = conflicting.map((id) => id.replace('slot-', '')).join(', ');
      throw new BadRequestException({ message: 'Cannot block booked slots. Cancel the appointments first.', code: 'SLOT_BOOKED', slots: times });
    }

    const ops = dto.slotIds.map((slotId) => ({
      updateOne: {
        filter: { vet: vid, date: dto.date, slotId },
        update: { $setOnInsert: { vet: vid, date: dto.date, slotId, time: slotId.replace('slot-', '') } },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await this.blockedSlotModel.bulkWrite(ops);
    }
    return { data: null, message: 'Slots blocked' };
  }

  async unblockSlots(vetId: string, dto: BlockSlotsDto): Promise<ServiceResponse<null>> {
    await this.blockedSlotModel.deleteMany({
      vet: new Types.ObjectId(vetId),
      date: dto.date,
      slotId: { $in: dto.slotIds },
    }).exec();
    return { data: null, message: 'Slots unblocked' };
  }

  async blockDay(vetId: string, dto: BlockDayDto): Promise<ServiceResponse<null>> {
    const dateObj = new Date(dto.date);
    const dateLabel = dateObj.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });

    await this.timeOffModel.create({
      vet: new Types.ObjectId(vetId),
      date: dto.date,
      dateLabel,
      reason: 'Day off',
    });

    return { data: null, message: 'Day blocked' };
  }

  async cancelTimeOff(timeOffId: string): Promise<ServiceResponse<null>> {
    await this.timeOffModel.findByIdAndDelete(timeOffId).exec();
    return { data: null, message: 'Time off cancelled' };
  }

  // ─── Onboarding ───────────────────────────────────────

  async getOnboardingDraft(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const draft = await this.vetApplicationModel
      .findOne({ vetId: new Types.ObjectId(vetId), status: 'pending' })
      .lean()
      .exec();

    if (!draft) {
      return { data: {}, message: 'No draft found' };
    }

    return {
      data: {
        fullName: draft.fullName,
        phone: draft.phone,
        clinicName: draft.clinicName,
        email: draft.email,
        city: draft.city,
        area: draft.area,
        fullAddress: draft.fullAddress,
        specialisations: draft.specialisations,
        feeMin: `${draft.feeMin}`,
        feeMax: `${draft.feeMax}`,
        languages: draft.languages,
        pvmcNumber: draft.pvmcNumber,
        yearsOfExperience: `${draft.yearsOfExperience}`,
        primaryQualification: draft.primaryQualification,
        university: draft.university,
        additionalCertifications: draft.additionalCertifications,
        pvmcLicense: draft.pvmcLicense ? { name: draft.pvmcLicense, status: 'uploaded' } : null,
        degreeCertificate: draft.degreeCertificate ? { name: draft.degreeCertificate, status: 'uploaded' } : null,
        cnic: draft.cnic ? { name: draft.cnic, status: 'uploaded' } : null,
        clinicPhoto: draft.clinicPhoto ? { name: draft.clinicPhoto, status: 'uploaded' } : null,
        payoutMethod: draft.payoutMethod,
        accountTitle: draft.accountTitle,
        walletNumber: draft.walletNumber,
        bankName: draft.bankName,
        accountNumber: draft.accountNumber,
        cnicOnAccount: draft.cnicOnAccount,
      },
      message: 'Draft retrieved',
    };
  }

  async submitOnboarding(dto: SubmitOnboardingDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    await this.vetApplicationModel.create({
      fullName: dto.fullName,
      phone: dto.phone,
      clinicName: dto.clinicName,
      email: dto.email,
      city: dto.city,
      area: dto.area,
      fullAddress: dto.fullAddress,
      lat: dto.lat,
      lng: dto.lng,
      specialisations: dto.specialisations,
      feeMin: parseInt(dto.feeMin, 10),
      feeMax: parseInt(dto.feeMax, 10),
      languages: dto.languages,
      pvmcNumber: dto.pvmcNumber,
      yearsOfExperience: parseInt(dto.yearsOfExperience, 10),
      primaryQualification: dto.primaryQualification,
      university: dto.university,
      additionalCertifications: dto.additionalCertifications ?? null,
      pvmcLicense: dto.pvmcLicense?.name ?? null,
      degreeCertificate: dto.degreeCertificate?.name ?? null,
      cnic: dto.cnic?.name ?? null,
      clinicPhoto: dto.clinicPhoto?.name ?? null,
      payoutMethod: dto.payoutMethod,
      accountTitle: dto.accountTitle,
      walletNumber: dto.walletNumber ?? null,
      bankName: dto.bankName ?? null,
      accountNumber: dto.accountNumber ?? null,
      cnicOnAccount: dto.cnicOnAccount,
      status: 'pending',
    });

    return { data: { success: true, message: 'Application submitted for review' }, message: 'Application submitted' };
  }

  // documentType drives storage policy: 'cnic' is government ID and goes to private storage
  // (returned reference is an S3 key, not a browsable URL — pair with getSignedReadUrl at
  // read time). Everything else (pvmcLicense/degreeCertificate/clinicPhoto) is a public URL
  // under the 'uploads' prefix — the bucket's policy only grants public s3:GetObject on a fixed
  // set of prefixes (uploads/, pets/, avatars/), so a new prefix here would 403 despite looking
  // like a valid URL; reusing 'uploads' needs no bucket-policy change. The returned `name` is
  // what onboarding draft/submit/admin-review flows already persist verbatim as the document
  // reference — kept as `name` rather than renaming to `url`/`key` to avoid touching that
  // existing contract.
  async uploadFile(
    file: Express.Multer.File,
    documentType?: string,
  ): Promise<ServiceResponse<{ name: string; status: string }>> {
    const reference =
      documentType === 'cnic'
        ? await this.s3Service.uploadPrivateImage(file, 'vet-cnic')
        : await this.s3Service.uploadImage(file, 'uploads');

    return { data: { name: reference, status: 'uploaded' }, message: 'File uploaded' };
  }

  // ─── Invite ───────────────────────────────────────────

  async getInviteDetails(token: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const invite = await this.inviteModel.findOne({ token, entityType: 'vet', status: 'pending' }).lean().exec();
    if (!invite) throw new NotFoundException('Invite not found or expired');

    return {
      data: {
        clinicName: invite.entityName,
        clinicArea: invite.entityArea ?? '',
        clinicInitials: getInitials(invite.entityName),
        inviterName: invite.inviterName,
        inviteeName: invite.inviteeName,
        role: invite.role,
        phone: invite.phone ?? '',
        email: invite.email ?? '',
      },
      message: 'Invite details retrieved',
    };
  }

  async acceptInvite(token: string, dto: AcceptVetInviteDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const invite = await this.inviteModel.findOne({ token, entityType: 'vet', status: 'pending' }).exec();
    if (!invite) throw new NotFoundException('Invite not found or expired');

    const inviter = await this.vetModel.findById(invite.entityId).lean().exec();
    if (!inviter || !inviter.clinicId) {
      throw new BadRequestException({
        message: 'Inviting clinic is not set up correctly',
        code: 'CLINIC_NOT_FOUND',
      });
    }

    // Vet.email is globally unique — without this check, an invitee who's already registered
    // anywhere (own clinic, or staff elsewhere) hits Mongo's unique-index error on create()
    // below, which isn't caught anywhere and surfaces as a raw 500. This isn't a fix for the
    // underlying "one identity, one clinic" limitation (see PENDING_FEATURES.md §6) — it just
    // turns the crash into an honest, actionable error.
    const existingVet = await this.vetModel
      .findOne({ email: dto.email })
      .lean()
      .exec();
    if (existingVet) {
      throw new ConflictException({
        message:
          'This email is already registered as a vet. Please use a different email or contact support.',
        code: 'EMAIL_ALREADY_REGISTERED',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      await this.vetModel.create({
        name: dto.fullName,
        clinicName: invite.entityName,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone,
        address: inviter.address,
        area: invite.entityArea ?? '',
        // Inherit the clinic's real coordinates rather than falling back to the schema default —
        // an invited team member is joining an existing clinic, not setting up a new location.
        location: inviter.location,
        fee: {
          min: parseInt(dto.consultationFee, 10) || 500,
          max: parseInt(dto.consultationFee, 10) || 1000,
        },
        specializations: dto.specialisations,
        languages: dto.languages,
        pvmcNumber: dto.pvmcNumber,
        yearsExperience: parseInt(dto.yearsOfExperience, 10),
        primaryQualification: dto.primaryQualification,
        pvmcLicense: dto.pvmcLicense?.name ?? null,
        cnicDocument: dto.cnic?.name ?? null,
        verified: inviter.verified,
        applicationStatus: 'approved',
        subscriptionStatus: inviter.subscriptionStatus,
        clinicId: inviter.clinicId,
        staffRole: invite.role as 'team_vet' | 'manager',
      });
    } catch (err: unknown) {
      // Belt-and-suspenders for the race between the findOne check above and this insert (two
      // accepts for the same email landing at the same instant) — same clean error either way,
      // instead of leaking a raw Mongo E11000 as a 500 in that narrow window.
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException({
          message: 'This email is already registered as a vet. Please use a different email or contact support.',
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }
      throw err;
    }

    invite.status = 'accepted';
    await invite.save();

    return { data: { success: true, message: 'Invite accepted' }, message: 'Invite accepted' };
  }

  // ─── Missing Endpoints ────────────────────────────────

  async updateAppointmentStatus(user: JwtPayload, appointmentId: string, status: string): Promise<ServiceResponse<null>> {
    const statusMap: Record<string, 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show'> = {
      confirmed: 'confirmed',
      inProgress: 'in-progress',
      done: 'completed',
      cancelled: 'cancelled',
      noShow: 'no-show',
    };
    const mappedStatus = statusMap[status];
    if (!mappedStatus) {
      throw new BadRequestException({ message: 'Invalid appointment status', code: 'INVALID_STATUS' });
    }

    // admin_vet/manager can act on any clinic-mate's appointment (same front-desk pattern as
    // getClinicScheduleAppointments) — a plain team_vet can only act on their own.
    const canManageClinic = user.staffRole != null && ['admin_vet', 'manager'].includes(user.staffRole);
    const vetFilter = canManageClinic
      ? { $in: (await this.resolveClinicVetIds(user.sub)).vetIds }
      : new Types.ObjectId(user.sub);

    const appt = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        vet: vetFilter,
      })
      .exec();
    if (!appt) throw new NotFoundException('Appointment not found');

    if (!isValidAppointmentTransition(appt.status, mappedStatus)) {
      throw new UnprocessableEntityException({
        message: `Cannot move an appointment from '${appt.status}' to '${mappedStatus}'`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    // A vet can't manually confirm a safepay appointment ahead of the Safepay webhook —
    // confirmation must follow real payment, not the other way around. COD has no payment to
    // wait for, so it's unaffected.
    if (
      mappedStatus === 'confirmed' &&
      appt.paymentMethod === 'safepay' &&
      appt.paymentStatus !== 'held'
    ) {
      throw new UnprocessableEntityException({
        message: 'Cannot confirm — payment has not been received yet',
        code: 'PAYMENT_NOT_RECEIVED',
      });
    }

    // Cancellation always releases a held payment, regardless of which side (owner or vet)
    // initiated it — the money's fate follows the booking's fate, not the actor. Mirrors the
    // owner-side cancelAppointment behavior in appointments.service.ts, including refunding
    // before committing the status change so a Safepay failure doesn't leave the appointment
    // 'cancelled' with a 'refunded' label while no money actually moved.
    if (
      mappedStatus === 'cancelled' &&
      appt.paymentStatus === 'held' &&
      appt.paymentMethod === 'safepay' &&
      appt.paymentReference
    ) {
      try {
        await this.safepayService.refundPayment(
          appt.paymentReference,
          appt.fee,
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
      appt.paymentStatus = 'refunded';
    }

    appt.status = mappedStatus;
    // Mirrors completeAppointment() in appointments.service.ts — this is the second vet-facing
    // "mark complete" path and must apply the same payout-hold window, or a safepay appointment
    // completed through this path would release instantly while the other path holds for
    // PAYOUT_HOLD_MS, reopening the exact drift this state machine was built to prevent.
    if (mappedStatus === 'completed' && appt.paymentStatus === 'held') {
      if (appt.paymentMethod === 'safepay') {
        appt.payoutEligibleAt = new Date(Date.now() + PAYOUT_HOLD_MS);
      } else {
        appt.paymentStatus = 'released';
      }
    }
    await appt.save();

    return { data: null, message: `Appointment ${status}` };
  }

  async addVaccination(vetId: string, petId: string, name: string, dateAdministered: string, nextDueDate?: string, batchNumber?: string): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    const vaccination = {
      name,
      date: dateAdministered,
      nextDue: nextDueDate ?? dateAdministered,
      vetId: new Types.ObjectId(vetId),
      vetName: vet?.name ?? 'Vet',
      verified: true,
      notes: batchNumber ? `Batch: ${batchNumber}` : null,
      certificatePhoto: null,
    };
    await this.petModel.findByIdAndUpdate(petId, { $push: { vaccinations: vaccination } }).exec();
    return { data: null, message: 'Vaccination recorded' };
  }

  async getThreadMessages(vetId: string, patientId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    // patientId is the pet's _id — resolve to owner then find the thread
    const pet = await this.petModel.findById(patientId).select('owner').lean().exec();
    if (!pet) throw new NotFoundException('Patient not found');

    const vetObjectId = new Types.ObjectId(vetId);
    const ownerObjectId = pet.owner as Types.ObjectId;

    let thread = await this.threadModel.findOne({
      user: ownerObjectId,
      vetId: vetObjectId,
      type: 'vet',
    }).lean().exec();

    // no thread yet means no messages — return empty with the threadId null
    if (!thread) {
      return { data: [], message: 'No messages yet' };
    }

    const threadId = (thread._id as Types.ObjectId).toString();

    const [messages, vet, owner] = await Promise.all([
      this.messageModel.find({ thread: thread._id }).sort({ createdAt: 1 }).lean().exec(),
      this.vetModel.findById(vetId).select('name').lean().exec(),
      this.userModel.findById(ownerObjectId).select('name').lean().exec(),
    ]);

    const vetName = vet?.name ?? 'Vet';
    const ownerName = owner?.name ?? 'Owner';

    const data = messages.map((m) => {
      const isVet = m.sender === 'doctor';
      return {
        id: (m._id as Types.ObjectId).toString(),
        threadId,
        type: m.type,
        text: m.text ?? undefined,
        senderRole: isVet ? 'vet' : 'owner',
        senderName: isVet ? vetName : ownerName,
        sentAt: (m as unknown as { createdAt: Date }).createdAt,
        product: m.product
          ? { name: m.product.name, category: null, price: m.product.pricePKR }
          : undefined,
        pet: m.pet ?? undefined,
        clinicRequest: m.clinicRequest ?? undefined,
        consultationStatus: m.consultationStatus ?? undefined,
      };
    });

    return { data, message: 'Messages retrieved' };
  }

  async searchRecommendProducts(
    vetId: string,
    q: string,
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const pattern = new RegExp(q, 'i');
    const vid = new Types.ObjectId(vetId);

    const [listings, products] = await Promise.all([
      this.listingModel.find({ vet: vid, status: 'active', name: pattern }).limit(10).lean().exec(),
      this.productModel.find({ name: pattern, inStock: true }).limit(10).lean().exec(),
    ]);

    const results: Record<string, unknown>[] = [
      ...listings.map((l) => ({
        id: (l._id as Types.ObjectId).toString(),
        name: l.name,
        price: l.price,
        photo: l.photo,
        source: 'own_listing',
        storeId: vetId,
        storeName: null,
      })),
      ...products.map((p) => ({
        id: (p._id as Types.ObjectId).toString(),
        name: p.name,
        price: p.price,
        photo: p.photo,
        source: 'store_product',
        storeId: (p.store as Types.ObjectId).toString(),
        storeName: p.storeName,
      })),
    ];

    return { data: results, message: 'Search results' };
  }

  async recommendProduct(
    vetId: string,
    petId: string,
    productId: string,
    source?: 'own_listing' | 'store_product',
  ): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const pet = await this.petModel.findById(petId).lean().exec();
    if (!pet) throw new NotFoundException('Pet not found');

    const owner = await this.userModel.findById(pet.owner).lean().exec();
    if (!owner) throw new NotFoundException('Owner not found');

    const petPayload: PetSharePayload = {
      petId: (pet._id as Types.ObjectId).toString(),
      name: pet.name,
    };

    // resolve product details — auto-detect source if not explicitly provided:
    // try own listing first (scoped to this vet), then fall back to store product
    let productDetails: {
      id: string;
      name: string;
      pricePKR: number;
      storeId: string;
      storeName: string;
      source: 'own_listing' | 'store_product';
    };

    const tryListing = source !== 'store_product'
      ? await this.listingModel.findOne({ _id: new Types.ObjectId(productId), vet: new Types.ObjectId(vetId) }).lean().exec()
      : null;

    if (tryListing) {
      productDetails = {
        id: (tryListing._id as Types.ObjectId).toString(),
        name: tryListing.name,
        pricePKR: tryListing.price,
        storeId: vetId,
        storeName: vet.clinicName,
        source: 'own_listing',
      };
    } else {
      const product = await this.productModel.findById(productId).lean().exec();
      if (!product) throw new NotFoundException('Product not found');
      productDetails = {
        id: (product._id as Types.ObjectId).toString(),
        name: product.name,
        pricePKR: product.price,
        storeId: (product.store as Types.ObjectId).toString(),
        storeName: product.storeName,
        source: 'store_product',
      };
    }

    const vetObjectId = new Types.ObjectId(vetId);
    const ownerObjectId = owner._id as Types.ObjectId;

    // find or create the vet consultation thread for this owner
    let thread = await this.threadModel.findOne({ user: ownerObjectId, vetId: vetObjectId, type: 'vet' }).lean().exec();
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

    const message = await this.messageModel.create({
      thread: thread._id,
      type: 'product_recommendation',
      sender: 'doctor',
      text: null,
      product: productDetails,
      pet: petPayload,
    });

    await this.threadModel.findByIdAndUpdate(thread._id, {
      preview: `Recommended: ${productDetails.name} for ${petPayload.name}`,
      $inc: { unread: 1 },
    });

    const threadId = (thread._id as Types.ObjectId).toString();
    const response: MessageResponse = {
      id: (message._id as Types.ObjectId).toString(),
      thread: threadId,
      type: 'product_recommendation',
      sender: 'doctor',
      text: null,
      product: productDetails,
      pet: petPayload,
      clinicRequest: null,
      consultationStatus: null,
      createdAt: (message as MessageDocument).createdAt,
    };

    this.chatGateway.server.to(threadId).emit('message:received', response);

    return { data: null, message: 'Recommendation sent' };
  }

  // ─── Clinic requests ────────────────────────────────────

  async getClinicRequests(
    vetId: string,
    status?: string,
  ): Promise<ServiceResponse<ClinicDispenseResponse[]>> {
    const filter: Record<string, unknown> = { vet: new Types.ObjectId(vetId) };
    if (status) filter.status = status;

    const requests = await this.clinicDispenseModel.find(filter).sort({ createdAt: -1 }).lean().exec();
    if (requests.length === 0) return { data: [], message: 'Requests retrieved' };

    const petIds = [...new Set(requests.map((r) => (r.pet as Types.ObjectId).toString()))];
    const [pets, vet] = await Promise.all([
      this.petModel.find({ _id: { $in: petIds } }).select('name').lean().exec(),
      this.vetModel.findById(vetId).select('name').lean().exec(),
    ]);
    const petNames = new Map(pets.map((p) => [(p._id as Types.ObjectId).toString(), p.name]));
    const vetName = vet?.name ?? 'Vet';

    const data = requests.map((r) =>
      toClinicDispenseResponse(r, petNames.get((r.pet as Types.ObjectId).toString()) ?? 'Pet', vetName),
    );

    return { data, message: 'Requests retrieved' };
  }

  private async transitionClinicRequest(
    vetId: string,
    requestId: string,
    fromStatus: 'requested' | 'confirmed',
    toStatus: 'confirmed' | 'declined' | 'dispensed',
    timestampField: 'confirmedAt' | 'declinedAt' | 'dispensedAt',
  ): Promise<ClinicDispenseDocument> {
    const request = await this.clinicDispenseModel.findById(requestId).exec();
    if (!request) throw new NotFoundException({ message: 'Request not found', code: 'REQUEST_NOT_FOUND' });
    if (request.vet.toString() !== vetId) {
      throw new ForbiddenException({ message: 'This request does not belong to you', code: 'FORBIDDEN' });
    }
    if (request.status !== fromStatus) {
      throw new BadRequestException({
        message: `Request must be ${fromStatus} to perform this action`,
        code: 'INVALID_STATUS',
      });
    }

    request.status = toStatus;
    request[timestampField] = new Date();
    await request.save();

    const message = await this.messageModel.create({
      thread: request.thread,
      type: 'clinic_request',
      sender: 'doctor',
      text: null,
      clinicRequest: {
        requestId: request._id,
        itemName: request.itemName,
        qty: request.qty,
        status: toStatus,
      },
    });

    const threadId = (request.thread as Types.ObjectId).toString();
    const previewByStatus: Record<string, string> = {
      confirmed: `Confirmed: ${request.itemName}`,
      declined: `Declined: ${request.itemName}`,
      dispensed: `Dispensed: ${request.itemName}`,
    };
    await this.threadModel.findByIdAndUpdate(request.thread, {
      preview: previewByStatus[toStatus],
      $inc: { unread: 1 },
    });

    const response: MessageResponse = {
      id: (message._id as Types.ObjectId).toString(),
      thread: threadId,
      type: 'clinic_request',
      sender: 'doctor',
      text: null,
      product: null,
      pet: null,
      clinicRequest: {
        requestId: (request._id as Types.ObjectId).toString(),
        itemName: request.itemName,
        qty: request.qty,
        status: toStatus,
      },
      consultationStatus: null,
      createdAt: (message as MessageDocument).createdAt,
    };
    this.chatGateway.server.to(threadId).emit('message:received', response);

    return request;
  }

  async confirmClinicRequest(vetId: string, requestId: string): Promise<ServiceResponse<null>> {
    await this.transitionClinicRequest(vetId, requestId, 'requested', 'confirmed', 'confirmedAt');
    return { data: null, message: 'Request confirmed' };
  }

  async declineClinicRequest(vetId: string, requestId: string): Promise<ServiceResponse<null>> {
    await this.transitionClinicRequest(vetId, requestId, 'requested', 'declined', 'declinedAt');
    return { data: null, message: 'Request declined' };
  }

  async dispenseClinicRequest(vetId: string, requestId: string): Promise<ServiceResponse<null>> {
    const request = await this.transitionClinicRequest(vetId, requestId, 'confirmed', 'dispensed', 'dispensedAt');

    await this.listingModel.updateOne(
      { _id: request.listing },
      { $inc: { inStock: -request.qty, sold: request.qty } },
    );

    return { data: null, message: 'Request marked as dispensed' };
  }

  // ─── Paid text consultations ───────────────────────────

  async getVetConsultations(
    vetId: string,
    status?: string,
  ): Promise<ServiceResponse<ConsultationSessionResponse[]>> {
    const caller = await this.vetModel.findById(vetId).lean().exec();
    if (!caller) throw new NotFoundException('Vet not found');

    // Clinic-wide visibility: any staff on the same clinic can see a session,
    // not just the exact vet it was created against. The direct vet-match is
    // kept as a safety net for sessions that predate clinicId denormalization.
    const filter: Record<string, unknown> = caller.clinicId
      ? { $or: [{ vet: new Types.ObjectId(vetId) }, { clinicId: caller.clinicId }] }
      : { vet: new Types.ObjectId(vetId) };
    if (status) filter.status = status;

    const sessions = await this.consultationModel.find(filter).sort({ createdAt: -1 }).lean().exec();
    if (sessions.length === 0) return { data: [], message: 'Consultations retrieved' };

    const petIds = [...new Set(sessions.map((s) => (s.pet as Types.ObjectId).toString()))];
    const sessionVetIds = [...new Set(sessions.map((s) => (s.vet as Types.ObjectId).toString()))];
    const ownerIds = [...new Set(sessions.map((s) => (s.owner as Types.ObjectId).toString()))];
    const [pets, vets, owners] = await Promise.all([
      this.petModel.find({ _id: { $in: petIds } }).select('name').lean().exec(),
      this.vetModel.find({ _id: { $in: sessionVetIds } }).lean().exec(),
      this.userModel.find({ _id: { $in: ownerIds } }).select('name').lean().exec(),
    ]);
    const petNames = new Map(pets.map((p) => [(p._id as Types.ObjectId).toString(), p.name]));
    const vetMap = new Map(vets.map((v) => [(v._id as Types.ObjectId).toString(), v]));
    const ownerNames = new Map(owners.map((o) => [(o._id as Types.ObjectId).toString(), o.name]));

    const clinicIds = [...new Set(vets.filter((v) => v.clinicId).map((v) => (v.clinicId as Types.ObjectId).toString()))];
    const clinics = clinicIds.length
      ? await this.clinicModel.find({ _id: { $in: clinicIds } }).lean().exec()
      : [];
    const clinicMap = new Map(clinics.map((c) => [(c._id as Types.ObjectId).toString(), c]));

    const data = sessions.map((s) => {
      const sessionVet = vetMap.get((s.vet as Types.ObjectId).toString());
      const clinic = sessionVet?.clinicId ? clinicMap.get((sessionVet.clinicId as Types.ObjectId).toString()) : null;
      return toConsultationSessionResponse(
        s,
        petNames.get((s.pet as Types.ObjectId).toString()) ?? 'Pet',
        sessionVet?.name ?? 'Vet',
        ownerNames.get((s.owner as Types.ObjectId).toString()) ?? 'Owner',
        clinic,
      );
    });

    return { data, message: 'Consultations retrieved' };
  }

  private async postConsultationStatusMessage(
    session: ConsultationSessionDocument,
    sender: 'user' | 'doctor',
    status: ConsultationSessionDocument['status'],
    previewText: string,
  ): Promise<void> {
    const threadId = session.thread as Types.ObjectId;

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

  // Verifies session ownership/status and throws the precise error for a failed
  // atomic transition attempt. Read-only — the mutation itself already happened
  // (or didn't) in the atomic findOneAndUpdate; this only explains why.
  // Any staff member on the same clinic may act on a session, not just the
  // exact vet it was created against — mirrors getVetConsultations' visibility.
  private consultationOwnershipFilter(user: JwtPayload, sessionId: string): Record<string, unknown> {
    const vetMatch = { vet: new Types.ObjectId(user.sub) };
    if (!user.clinicId) return { _id: new Types.ObjectId(sessionId), ...vetMatch };
    return {
      _id: new Types.ObjectId(sessionId),
      $or: [vetMatch, { clinicId: new Types.ObjectId(user.clinicId) }],
    };
  }

  private async explainFailedConsultationTransition(
    user: JwtPayload,
    sessionId: string,
    requiredStatus: string,
    invalidStatusMessage: string,
  ): Promise<never> {
    const exists = await this.consultationModel.findById(sessionId).lean().exec();
    if (!exists) throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });

    const isOwnVet = exists.vet.toString() === user.sub;
    const isClinicMate = Boolean(user.clinicId) && exists.clinicId?.toString() === user.clinicId;
    if (!isOwnVet && !isClinicMate) {
      throw new ForbiddenException({ message: 'This session does not belong to you', code: 'FORBIDDEN' });
    }
    if (exists.status !== requiredStatus) {
      throw new BadRequestException({ message: invalidStatusMessage, code: 'INVALID_STATUS' });
    }
    // Status matched but the atomic update still didn't apply — another
    // concurrent request won the race between our read and our write.
    throw new BadRequestException({
      message: 'This session was already resolved by someone else',
      code: 'ALREADY_RESOLVED',
    });
  }

  // Manual fallback for when the Safepay webhook never arrives — the vet checks their own
  // account/Safepay dashboard, confirms the payment actually landed, and pushes it through by hand.
  async markConsultationPaid(user: JwtPayload, sessionId: string): Promise<ServiceResponse<null>> {
    const now = new Date();

    const updated = await this.consultationModel.findOneAndUpdate(
      { ...this.consultationOwnershipFilter(user, sessionId), status: 'pending_payment' },
      {
        $set: {
          status: 'active',
          paidAt: now,
          startedAt: now,
          autoExpireAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          resolvedBy: new Types.ObjectId(user.sub),
          resolvedByRole: user.staffRole ?? 'admin_vet',
        },
      },
      { new: true },
    ).exec();

    if (!updated) {
      return this.explainFailedConsultationTransition(
        user,
        sessionId,
        'pending_payment',
        'Session must be awaiting payment to be manually marked as paid',
      );
    }

    await this.postConsultationStatusMessage(updated, 'doctor', 'active', 'Paid consultation started');

    return { data: null, message: 'Consultation activated' };
  }

  // Flags an already-paid, active session for admin review (e.g. suspected fraud/chargeback) —
  // not a dispute over whether payment happened, since Safepay's webhook already confirmed that.
  async disputeConsultation(user: JwtPayload, sessionId: string, reason: string): Promise<ServiceResponse<null>> {
    const updated = await this.consultationModel.findOneAndUpdate(
      { ...this.consultationOwnershipFilter(user, sessionId), status: 'active' },
      {
        $set: {
          status: 'disputed',
          disputeReason: reason,
          resolvedBy: new Types.ObjectId(user.sub),
          resolvedByRole: user.staffRole ?? 'admin_vet',
        },
      },
      { new: true },
    ).exec();

    if (!updated) {
      return this.explainFailedConsultationTransition(
        user,
        sessionId,
        'active',
        'Only an active consultation can be disputed',
      );
    }

    await this.postConsultationStatusMessage(updated, 'doctor', 'disputed', 'Payment disputed — escalated for review');

    return { data: null, message: 'Consultation payment disputed' };
  }

  async endConsultation(user: JwtPayload, sessionId: string): Promise<ServiceResponse<null>> {
    const updated = await this.consultationModel.findOneAndUpdate(
      { ...this.consultationOwnershipFilter(user, sessionId), status: 'active' },
      { $set: { status: 'closed', closedBy: 'vet', closedAt: new Date() } },
      { new: true },
    ).exec();

    if (!updated) {
      return this.explainFailedConsultationTransition(
        user,
        sessionId,
        'active',
        'Only an active session can be ended',
      );
    }

    await this.postConsultationStatusMessage(updated, 'doctor', 'closed', 'Consultation ended');

    return { data: null, message: 'Consultation ended' };
  }

  async updateListingStatus(vetId: string, listingId: string, status: string): Promise<ServiceResponse<null>> {
    const listing = await this.listingModel.findOneAndUpdate(
      { _id: new Types.ObjectId(listingId), vet: new Types.ObjectId(vetId) },
      { status: status as 'active' | 'hidden' },
    ).exec();
    if (!listing) throw new NotFoundException('Listing not found');
    return { data: null, message: `Listing ${status}` };
  }

  async updateTeamMemberStatus(vetId: string, memberId: string, status: string): Promise<ServiceResponse<null>> {
    if (status === 'revoked') {
      await this.inviteModel.findOneAndUpdate(
        { _id: new Types.ObjectId(memberId), entityId: new Types.ObjectId(vetId), entityType: 'vet' },
        { status: 'expired' },
      ).exec();
    }
    return { data: null, message: `Member ${status}` };
  }

  // Shared by the vet-initiated withdraw endpoint and the weekly auto-batch cron below.
  // Scoped to every vet under the clinic (not just whichever staff member triggered it) and
  // always recorded under the clinic's canonical adminVetId, so payout history/balance is one
  // shared clinic ledger rather than fragmenting per staff member. Pulls from both appointments
  // and paid text consultations — payoutId on each guards against paying the same item out
  // twice. Returns null when there's nothing to batch across either source, so callers can
  // decide whether that's an error or just a no-op.
  private async batchPayoutForVet(
    vetIds: Types.ObjectId[],
    adminVetId: Types.ObjectId,
    clinic: Pick<Clinic, 'payoutMethod' | 'bankName'>,
    requestedBy: Types.ObjectId | null,
  ): Promise<{ payoutId: Types.ObjectId; amount: number } | null> {
    const [unsettledAppts, unsettledConsults] = await Promise.all([
      this.appointmentModel
        .find({ vet: { $in: vetIds }, status: 'completed', paymentStatus: 'released', payoutId: null })
        .exec(),
      this.consultationModel
        .find({ vet: { $in: vetIds }, status: { $in: ['closed', 'expired'] }, payoutId: null })
        .exec(),
    ]);

    const itemCount = unsettledAppts.length + unsettledConsults.length;
    const amount =
      unsettledAppts.reduce((s, a) => s + a.vetPayout, 0) + unsettledConsults.reduce((s, c) => s + c.vetPayout, 0);
    if (itemCount === 0 || amount <= 0) return null;

    const gross =
      unsettledAppts.reduce((s, a) => s + a.fee, 0) + unsettledConsults.reduce((s, c) => s + c.amount, 0);
    const commission =
      unsettledAppts.reduce((s, a) => s + a.platformCommission, 0) +
      unsettledConsults.reduce((s, c) => s + c.platformCommission, 0);

    const payout = await this.payoutModel.create({
      entityId: adminVetId,
      entityType: 'vet',
      label: `Payout — ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      date: karachiDateStr(),
      method: payoutMethodLabel(clinic.payoutMethod, clinic.bankName),
      orders: itemCount,
      gross,
      commission,
      netPaid: amount,
      amount,
      status: 'pending',
      requestedBy,
    });

    await Promise.all([
      unsettledAppts.length
        ? this.appointmentModel
            .updateMany({ _id: { $in: unsettledAppts.map((a) => a._id) } }, { $set: { payoutId: payout._id } })
            .exec()
        : Promise.resolve(),
      unsettledConsults.length
        ? this.consultationModel
            .updateMany({ _id: { $in: unsettledConsults.map((c) => c._id) } }, { $set: { payoutId: payout._id } })
            .exec()
        : Promise.resolve(),
    ]);

    return { payoutId: payout._id, amount };
  }

  // Restricted to admin_vet/manager via @ClinicRoles on the controller — a regular team_vet
  // can't trigger a clinic payout, only view what the guard's role check allows them to.
  async vetWithdraw(vetId: string): Promise<ServiceResponse<{ payoutId: string; amount: number }>> {
    const { clinicId, vetIds, adminVetId } = await this.resolveClinicVetIds(vetId);
    if (!clinicId) {
      throw new BadRequestException({ message: 'No clinic is set up for this account', code: 'CLINIC_NOT_FOUND' });
    }

    const clinic = await this.clinicModel.findById(clinicId).lean().exec();
    if (!clinic?.payoutMethod) {
      throw new BadRequestException({
        message: 'Set up a payout account before requesting a withdrawal',
        code: 'PAYOUT_ACCOUNT_NOT_SET',
      });
    }

    const result = await this.batchPayoutForVet(vetIds, adminVetId, clinic, new Types.ObjectId(vetId));
    if (!result) {
      throw new BadRequestException({
        message: 'No available balance to withdraw',
        code: 'NO_BALANCE_AVAILABLE',
      });
    }

    return {
      data: { payoutId: result.payoutId.toString(), amount: result.amount },
      message: 'Withdrawal requested — pending admin settlement',
    };
  }

  // Runs every Monday at 00:00 Asia/Karachi, pinned explicitly so it doesn't depend on the
  // host process's local TZ. Auto-batches every clinic's released-but-unpaid balance into a
  // pending Payout so admin has a ready queue each week instead of waiting on someone to click
  // "withdraw" individually. Dedupes by clinic (via adminVetId) so a clinic with several staff
  // vets who each have unsettled appointments gets exactly one combined batch, not one per vet.
  @Cron('0 0 * * 1', { timeZone: 'Asia/Karachi' })
  async autoBatchWeeklyPayouts(): Promise<void> {
    const [vetIdsFromAppts, vetIdsFromConsults] = await Promise.all([
      this.appointmentModel.distinct('vet', {
        status: 'completed',
        paymentStatus: 'released',
        payoutId: null,
      }),
      this.consultationModel.distinct('vet', {
        status: { $in: ['closed', 'expired'] },
        payoutId: null,
      }),
    ]);
    const vetIdsWithBalance = [...vetIdsFromAppts, ...vetIdsFromConsults];

    const seenClinics = new Set<string>();
    let batched = 0;

    for (const vetId of vetIdsWithBalance as Types.ObjectId[]) {
      const { clinicId, vetIds, adminVetId } = await this.resolveClinicVetIds(vetId.toString());
      if (!clinicId) continue; // legacy solo vet with no Clinic doc — no payout account possible
      if (seenClinics.has(adminVetId.toString())) continue;
      seenClinics.add(adminVetId.toString());

      const clinic = await this.clinicModel
        .findById(clinicId)
        .select('payoutMethod bankName')
        .lean()
        .exec();
      if (!clinic?.payoutMethod) continue; // no payout account set up yet — skip until they add one

      const result = await this.batchPayoutForVet(vetIds, adminVetId, clinic, null);
      if (result) batched++;
    }

    if (batched > 0) {
      this.logger.log(`Weekly auto-batch: created ${batched} pending payout(s)`);
    }
  }

  async updateVetPayoutAccount(vetId: string, dto: UpdatePayoutAccountDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).select('name staffRole clinicId').lean().exec();
    if (!vet?.clinicId) {
      throw new BadRequestException({ message: 'No clinic is set up for this account', code: 'CLINIC_NOT_FOUND' });
    }
    const clinicId = vet.clinicId;
    const isBank = dto.method === 'bank_transfer';
    const previous = await this.clinicModel.findById(clinicId).lean().exec();
    const nextValues = {
      payoutMethod: dto.method,
      accountTitle: dto.accountTitle,
      walletNumber: isBank ? null : (dto.walletNumber ?? null),
      bankName: isBank ? (dto.bankName ?? null) : null,
      accountNumber: isBank ? (dto.accountNumber ?? null) : null,
    };
    await this.clinicModel.findByIdAndUpdate(clinicId, nextValues).exec();
    await this.recordPayoutAccountChange(clinicId, vetId, vet.name, vet.staffRole, previous, nextValues);
    return { data: null, message: 'Payout account submitted for verification' };
  }

  async getEarningsWithPeriod(vetId: string, method: string, period?: string): Promise<ServiceResponse<Record<string, unknown> | Record<string, unknown>[]>> {
    const dateFilter = this.getPeriodFilter(period);
    const vid = new Types.ObjectId(vetId);

    if (method === 'stats') {
      const appts = await this.appointmentModel.find({ vet: vid, status: 'completed', ...(dateFilter ? { createdAt: dateFilter } : {}) }).lean().exec();
      const vet = await this.vetModel.findById(vetId).lean().exec();
      const totalEarned = appts.reduce((s, a) => s + a.vetPayout, 0);
      const ownerVisits: Record<string, number> = {};
      for (const a of appts) ownerVisits[a.owner.toString()] = (ownerVisits[a.owner.toString()] ?? 0) + 1;
      const repeatCount = Object.values(ownerVisits).filter((v) => v > 1).length;
      const totalOwners = Object.keys(ownerVisits).length;
      return {
        data: {
          totalEarned: `PKR ${totalEarned.toLocaleString()}`, totalEarnedChange: 0, totalEarnedSubtitle: period ?? 'all time',
          bookings: appts.length, bookingsChange: 0, bookingsSubtitle: 'completed',
          repeatClients: totalOwners > 0 ? `${Math.round((repeatCount / totalOwners) * 100)}%` : '0%',
          repeatClientsChange: '0%', repeatClientsSubtitle: 'return rate',
          avgRating: vet?.rating ?? 0, avgRatingReviews: vet?.reviewCount ?? 0,
        },
        message: 'Earnings stats retrieved',
      };
    }

    if (method === 'monthly') return this.getMonthlyEarnings(vetId);
    if (method === 'peak-hours') return this.getPeakHours(vetId);
    if (method === 'pet-types') return this.getPetTypes(vetId);

    return { data: {}, message: 'Unknown method' };
  }

  private getPeriodFilter(period?: string): Record<string, unknown> | null {
    if (!period) return null;
    const now = new Date();
    if (period === '30d') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return { $gte: d };
    }
    if (period === '6m') {
      const d = new Date(); d.setMonth(d.getMonth() - 6);
      return { $gte: d };
    }
    if (period === 'ytd') return { $gte: new Date(now.getFullYear(), 0, 1) };
    if (period === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start, $lt: end };
    }
    if (period === 'lastQuarter') {
      const d = new Date(); d.setMonth(d.getMonth() - 3);
      return { $gte: d };
    }
    return null;
  }
}
