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
import { BlockedSlot, BlockedSlotDocument } from '../../database/schemas/blocked-slot.schema';
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
    @InjectModel(BlockedSlot.name) private readonly blockedSlotModel: Model<BlockedSlotDocument>,
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
          method: vet.payoutMethod ?? 'JazzCash',
          methodInitials: getInitials(vet.payoutMethod ?? 'JC'),
          accountHolder: vet.accountTitle ?? vet.name,
          maskedNumber: masked,
          commissionRate: '15%',
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

  async updateClinicSettings(vetId: string, dto: UpdateClinicSettingsDto): Promise<ServiceResponse<null>> {
    const vet = await this.vetModel.findById(vetId).exec();
    if (!vet) throw new NotFoundException('Vet not found');

    if (dto.profile) {
      vet.clinicName = dto.profile.clinicName;
      vet.phone = dto.profile.phone;
      vet.address = dto.profile.fullAddress;
      vet.city = dto.profile.city;
      vet.area = dto.profile.area;
    }

    if (dto.consultation) {
      vet.fee = {
        min: parseInt(dto.consultation.inPersonFee, 10) || vet.fee.min,
        max: parseInt(dto.consultation.videoConsultFee, 10) || vet.fee.max,
      };
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
      vet.payoutMethod = dto.payout.method;
      vet.accountTitle = dto.payout.accountHolder;
    }

    if (dto.notifications) {
      vet.notifications = dto.notifications;
      vet.markModified('notifications');
    }

    await vet.save();

    return { data: null, message: 'Settings updated' };
  }

  // ─── Availability ─────────────────────────────────────

  async getAvailability(vetId: string, dateParam?: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const now = new Date();
    const refDate = dateParam ? new Date(dateParam) : now;
    const monthName = refDate.toLocaleString('en', { month: 'long', year: 'numeric' });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const startOfWeek = new Date(refDate);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return {
        day: dayNames[d.getDay()],
        date: d.getDate(),
        fullDate: d.toISOString().slice(0, 10),
        isActive: d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10),
        isOff: d.getDay() === 0,
      };
    });

    const activeDay = weekDays.find((d) => d.isActive)?.fullDate ?? weekDays[0].fullDate;
    const todayAppts = await this.appointmentModel
      .find({ vet: new Types.ObjectId(vetId), date: activeDay })
      .lean()
      .exec();
    const bookedSlots = new Set(todayAppts.map((a) => a.timeSlot));

    const weekStart = startOfWeek.toISOString().slice(0, 10);
    const weekEnd = endOfWeek.toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
    const vid = new Types.ObjectId(vetId);

    const todayAppts = await this.appointmentModel
      .find({ vet: vid, date: today, status: { $in: ['pending', 'confirmed'] } })
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
        filter: { vet: vid, date: today, slotId },
        update: { $setOnInsert: { vet: vid, date: today, slotId, time: slotId.replace('slot-', '') } },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await this.blockedSlotModel.bulkWrite(ops);
    }
    return { data: null, message: 'Slots blocked' };
  }

  async unblockSlots(vetId: string, dto: BlockSlotsDto): Promise<ServiceResponse<null>> {
    const today = new Date().toISOString().slice(0, 10);
    await this.blockedSlotModel.deleteMany({
      vet: new Types.ObjectId(vetId),
      date: today,
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

  // ─── Missing Endpoints ────────────────────────────────

  async updateAppointmentStatus(vetId: string, appointmentId: string, status: string): Promise<ServiceResponse<null>> {
    const appt = await this.appointmentModel.findOneAndUpdate(
      { _id: new Types.ObjectId(appointmentId), vet: new Types.ObjectId(vetId) },
      { status: status === 'done' ? 'completed' : status === 'inProgress' ? 'confirmed' : status },
    ).exec();
    if (!appt) throw new NotFoundException('Appointment not found');
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

  async recommendProduct(vetId: string, petId: string, productId: string, ownerPhone: string): Promise<ServiceResponse<null>> {
    this.logger.log(`Vet ${vetId} recommending product ${productId} for pet ${petId} to ${ownerPhone}`);
    return { data: null, message: 'Recommendation sent' };
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

  async vetWithdraw(vetId: string): Promise<ServiceResponse<{ success: boolean }>> {
    return { data: { success: true }, message: 'Withdrawal requested' };
  }

  async updateVetPayoutAccount(vetId: string, accountNumber: string): Promise<ServiceResponse<null>> {
    await this.vetModel.findByIdAndUpdate(vetId, { mobileAccount: accountNumber }).exec();
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
