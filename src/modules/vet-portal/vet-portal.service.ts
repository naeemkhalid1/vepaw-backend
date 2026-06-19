import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import { Listing, ListingDocument } from '../../database/schemas/listing.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
import { TimeOff, TimeOffDocument } from '../../database/schemas/time-off.schema';
import { VisitNote, VisitNoteDocument } from '../../database/schemas/visit-note.schema';
import { VetApplication, VetApplicationDocument } from '../../database/schemas/vet-application.schema';
import { ServiceResponse } from '../../shared/types';
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

function getCategoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

@Injectable()
export class VetPortalService {
  private readonly logger = new Logger(VetPortalService.name);

  constructor(
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(Listing.name) private readonly listingModel: Model<ListingDocument>,
    @InjectModel(Invite.name) private readonly inviteModel: Model<InviteDocument>,
    @InjectModel(TimeOff.name) private readonly timeOffModel: Model<TimeOffDocument>,
    @InjectModel(VisitNote.name) private readonly visitNoteModel: Model<VisitNoteDocument>,
    @InjectModel(VetApplication.name) private readonly vetApplicationModel: Model<VetApplicationDocument>,
  ) {}

  // ─── Schedule ──────────────────────────────────────────

  async getScheduleStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vid = new Types.ObjectId(vetId);
    const today = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [todayAppts, monthAppts, vet] = await Promise.all([
      this.appointmentModel.find({ vet: vid, date: today }).lean().exec(),
      this.appointmentModel.find({ vet: vid, createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.vetModel.findById(vetId).lean().exec(),
    ]);

    const confirmed = todayAppts.filter((a) => a.status === 'confirmed').length;
    const pending = todayAppts.filter((a) => a.status === 'pending').length;
    const pendingEarnings = todayAppts.filter((a) => a.status !== 'cancelled').reduce((s, a) => s + a.vetPayout, 0);
    const monthTotal = monthAppts.length;

    const ownerIds = [...new Set(monthAppts.map((a) => a.owner.toString()))];
    const repeatOwners = ownerIds.filter((oid) => monthAppts.filter((a) => a.owner.toString() === oid).length > 1);

    return {
      data: {
        todayBookings: todayAppts.length,
        confirmedCount: confirmed,
        upcomingCount: pending,
        pendingEarnings,
        pendingEarningsLabel: `PKR ${pendingEarnings.toLocaleString()}`,
        thisMonth: monthTotal,
        thisMonthCommission: `PKR ${monthAppts.reduce((s, a) => s + a.platformCommission, 0).toLocaleString()} commission`,
        repeatClients: ownerIds.length > 0 ? `${Math.round((repeatOwners.length / ownerIds.length) * 100)}%` : '0%',
        repeatClientsSubtitle: 'returning this month',
      },
      message: 'Schedule stats retrieved',
    };
  }

  async getScheduleAppointments(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const today = new Date().toISOString().slice(0, 10);
    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), date: today })
      .sort({ timeSlot: 1 })
      .lean()
      .exec();

    const mapped = appts.map((a) => ({
      id: a._id.toString(),
      time: a.timeSlot,
      duration: '30 min',
      petName: a.petDetails.name,
      petInitial: a.petDetails.name[0].toUpperCase(),
      petColor: getColor(a.petDetails.name),
      ownerName: a.vetDetails.name,
      ownerPhone: a.vetDetails.phone,
      visitType: 'checkup',
      status: a.status === 'completed' ? 'done' : a.status,
    }));

    return { data: mapped, message: 'Appointments retrieved' };
  }

  async getNextPatient(vetId: string): Promise<ServiceResponse<Record<string, unknown> | null>> {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 5);

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
        avatarInitial: (pet?.name ?? 'P')[0].toUpperCase(),
        avatarColor: getColor(pet?.name ?? 'P'),
      },
      message: 'Next patient retrieved',
    };
  }

  // ─── Patients ──────────────────────────────────────────

  async getPatients(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const appts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId) })
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
        petInitial: p.name[0].toUpperCase(),
        petColor: getColor(p.name),
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
    const appts = await this.appointmentModel.find({ vet: new Types.ObjectId(vetId) }).lean().exec();
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

    const hasPendingVax = (pet.vaccinations ?? []).some((v) => new Date(v.nextDue) <= new Date());
    const hasOverdue = (pet.vaccinations ?? []).some((v) => new Date(v.nextDue) < new Date());

    return {
      data: {
        petName: pet.name,
        petInitial: pet.name[0].toUpperCase(),
        petColor: getColor(pet.name),
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
        nextAppointmentDate: nextAppt?.date ?? '',
        nextAppointmentTime: nextAppt?.timeSlot ?? '',
        nextAppointmentType: 'checkup',
        visitHistory: notes.map((n) => ({
          id: n._id.toString(),
          title: n.title,
          notes: n.notes,
          recordedBy: n.recordedBy,
          date: n.createdAt.toISOString().slice(0, 10),
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
      color: PET_TYPE_COLORS[name] ?? '#8B5CF6',
    }));

    return { data, message: 'Pet types retrieved' };
  }

  // ─── Payouts ──────────────────────────────────────────

  async getPayouts(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const payouts = await this.payoutModel
      .find({ entityId: new Types.ObjectId(vetId), entityType: 'vet' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const mapped = payouts.map((p) => ({
      id: p._id.toString(),
      label: p.label,
      date: p.date,
      method: p.method,
      amount: `PKR ${p.amount.toLocaleString()}`,
    }));

    return { data: mapped, message: 'Payouts retrieved' };
  }

  async getPayoutSummary(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const completedAppts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), status: 'completed', paymentStatus: 'released' })
      .lean()
      .exec();
    const available = completedAppts.reduce((s, a) => s + a.vetPayout, 0);

    const heldAppts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), status: 'completed', paymentStatus: 'held' })
      .lean()
      .exec();
    const held = heldAppts.reduce((s, a) => s + a.vetPayout, 0);

    return {
      data: { availableToWithdraw: available, heldInEscrow: held, nextAutoPayout: 'Monday' },
      message: 'Payout summary retrieved',
    };
  }

  async getPayoutAccount(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const account = vet.mobileAccount ?? '';
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;

    return {
      data: {
        label: vet.payoutMethod ?? 'JazzCash',
        initials: getInitials(vet.payoutMethod ?? 'JC'),
        maskedNumber: masked,
        accountName: vet.accountTitle ?? vet.name,
        commissionNote: `Platform commission applied`,
      },
      message: 'Payout account retrieved',
    };
  }

  // ─── Team ──────────────────────────────────────────────

  async getTeam(vetId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const members: Record<string, unknown>[] = [
      {
        id: vet._id.toString(),
        name: vet.name,
        initials: getInitials(vet.name),
        avatarColor: getColor(vet.name),
        subtitle: vet.specialty ?? 'Veterinarian',
        role: 'adminVet',
        roleLabel: 'Admin / Veterinarian',
        patients: null,
        rating: vet.rating,
        status: 'active',
        isYou: true,
      },
    ];

    const invites = await this.inviteModel
      .find({ entityId: new Types.ObjectId(vetId), entityType: 'vet', status: 'pending' })
      .lean()
      .exec();

    for (const inv of invites) {
      members.push({
        id: inv._id.toString(),
        name: inv.inviteeName,
        initials: getInitials(inv.inviteeName),
        avatarColor: getColor(inv.inviteeName),
        subtitle: inv.role,
        role: inv.role === 'veterinarian' ? 'veterinarian' : 'clinicAdmin',
        roleLabel: inv.role === 'veterinarian' ? 'Veterinarian' : 'Clinic Admin',
        patients: null,
        rating: null,
        status: 'invited',
        isYou: false,
      });
    }

    return { data: members, message: 'Team retrieved' };
  }

  async getTeamStats(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    const invites = await this.inviteModel.countDocuments({
      entityId: new Types.ObjectId(vetId),
      entityType: 'vet',
      status: 'pending',
    });

    return {
      data: {
        veterinarians: 1,
        vetSubtitle: 'practicing',
        admins: 0,
        adminSubtitle: 'clinic staff',
        pendingInvites: invites,
        pendingSubtitle: 'awaiting response',
        clinicRating: vet?.rating ?? 0,
        ratingSubtitle: `${vet?.reviewCount ?? 0} reviews`,
      },
      message: 'Team stats retrieved',
    };
  }

  async inviteTeamMember(vetId: string, dto: InviteTeamMemberDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.inviteModel.create({
      token,
      entityType: 'vet',
      entityId: new Types.ObjectId(vetId),
      entityName: vet.clinicName,
      entityArea: vet.area,
      inviterName: vet.name,
      inviteeName: dto.emailOrPhone,
      role: dto.role,
      phone: dto.emailOrPhone,
      email: dto.emailOrPhone.includes('@') ? dto.emailOrPhone : null,
      status: 'pending',
      expiresAt,
    });

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
      const colors = CATEGORY_COLORS[l.category] ?? { icon: '#6366F1', bg: '#EEF2FF' };
      return {
        id: l._id.toString(),
        name: l.name,
        category: l.category,
        categoryLabel: getCategoryLabel(l.category),
        price: l.price,
        inStock: l.inStock,
        sold: l.sold,
        status: l.status,
        iconColor: colors.icon,
        bgColor: colors.bg,
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
        unitsSoldPeriod: 'all time',
        listingRevenue: `PKR ${revenue.toLocaleString()}`,
        revenueSubtitle: 'total revenue',
      },
      message: 'Listing stats retrieved',
    };
  }

  async createListing(vetId: string, dto: CreateListingDto): Promise<ServiceResponse<null>> {
    await this.listingModel.create({
      vet: new Types.ObjectId(vetId),
      name: dto.name,
      price: dto.price,
      category: dto.category as 'medicine' | 'food' | 'treats',
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

  async getClinicSettings(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const vet = await this.vetModel.findById(vetId).lean().exec();
    if (!vet) throw new NotFoundException('Vet not found');

    const account = vet.mobileAccount ?? '';
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
          inPersonEnabled: true,
          videoEnabled: false,
          textEnabled: false,
        },
        availability: {
          workingDays,
          opens: vet.workingHours?.mon?.open ?? '09:00',
          closes: vet.workingHours?.mon?.close ?? '18:00',
          slotLength: '30 min',
          lunchBreak: '13:00 – 14:00',
          bookableSlotsPerDay: 16,
        },
        payout: {
          method: vet.payoutMethod ?? 'JazzCash',
          methodInitials: getInitials(vet.payoutMethod ?? 'JC'),
          accountHolder: vet.accountTitle ?? vet.name,
          maskedNumber: masked,
          commissionRate: '15%',
          commissionLabel: 'Platform commission on bookings',
        },
        notifications: [
          { id: 'new-booking', label: 'New booking', channel: 'Push + Email', icon: 'calendar', enabled: true },
          { id: 'cancellation', label: 'Cancellation', channel: 'Push', icon: 'x-circle', enabled: true },
          { id: 'review', label: 'New review', channel: 'Email', icon: 'star', enabled: true },
          { id: 'payout', label: 'Payout processed', channel: 'Push + Email', icon: 'wallet', enabled: true },
        ],
      },
      message: 'Clinic settings retrieved',
    };
  }

  async updateClinicSettings(vetId: string, dto: UpdateClinicSettingsDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).exec();
    if (!vet) throw new NotFoundException('Vet not found');

    vet.clinicName = dto.profile.clinicName;
    vet.phone = dto.profile.phone;
    vet.address = dto.profile.fullAddress;
    vet.city = dto.profile.city;
    vet.area = dto.profile.area;
    vet.fee = { min: parseInt(dto.consultation.inPersonFee, 10) || vet.fee.min, max: parseInt(dto.consultation.videoConsultFee, 10) || vet.fee.max };
    await vet.save();

    return { data: null, message: 'Settings updated' };
  }

  // ─── Availability ─────────────────────────────────────

  async getAvailability(vetId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const now = new Date();
    const monthName = now.toLocaleString('en', { month: 'long', year: 'numeric' });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return {
        day: dayNames[d.getDay()],
        date: d.getDate(),
        isActive: d.getDate() === now.getDate(),
        isOff: d.getDay() === 0,
      };
    });

    const today = now.toISOString().slice(0, 10);
    const todayAppts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), date: today })
      .lean()
      .exec();
    const bookedSlots = new Set(todayAppts.map((a) => a.timeSlot));

    const timeOffs = await this.timeOffModel
      .find({ vet: new Types.ObjectId(vetId), date: { $gte: today } })
      .sort({ date: 1 })
      .lean()
      .exec();
    const blockedDates = new Set(timeOffs.map((t) => t.date));

    const slots: Record<string, unknown>[] = [];
    for (let h = 9; h < 18; h++) {
      for (const m of ['00', '30']) {
        const time = `${h.toString().padStart(2, '0')}:${m}`;
        const isBreak = h === 13;
        const isBlocked = blockedDates.has(today);
        const isBooked = bookedSlots.has(time);

        slots.push({
          id: `slot-${time}`,
          time,
          status: isBlocked ? 'blocked' : isBreak ? 'break' : isBooked ? 'booked' : 'available',
          ...(isBooked && todayAppts.find((a) => a.timeSlot === time)
            ? { label: todayAppts.find((a) => a.timeSlot === time)?.petDetails.name }
            : {}),
        });
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
    this.logger.log(`Blocked slots for vet ${vetId}: ${dto.slotIds.join(', ')}`);
    return { data: null, message: 'Slots blocked' };
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
        mobileAccount: draft.mobileAccount,
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
      mobileAccount: dto.mobileAccount,
      cnicOnAccount: dto.cnicOnAccount,
      status: 'pending',
    });

    return { data: { success: true, message: 'Application submitted for review' }, message: 'Application submitted' };
  }

  async uploadFile(file: Express.Multer.File): Promise<ServiceResponse<{ name: string; status: string }>> {
    return { data: { name: file.originalname, status: 'uploaded' }, message: 'File uploaded' };
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
        phone: invite.phone,
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

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.vetModel.create({
      name: dto.fullName,
      clinicName: invite.entityName,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      address: '',
      area: invite.entityArea ?? '',
      fee: { min: parseInt(dto.consultationFee, 10) || 500, max: parseInt(dto.consultationFee, 10) || 1000 },
      specializations: dto.specialisations,
      languages: dto.languages,
      pvmcNumber: dto.pvmcNumber,
      yearsExperience: parseInt(dto.yearsOfExperience, 10),
      primaryQualification: dto.primaryQualification,
      pvmcLicense: dto.pvmcLicense?.name ?? null,
      cnicDocument: dto.cnic?.name ?? null,
      verified: false,
      applicationStatus: 'pending',
    });

    invite.status = 'accepted';
    await invite.save();

    return { data: { success: true, message: 'Invite accepted' }, message: 'Invite accepted' };
  }
}
