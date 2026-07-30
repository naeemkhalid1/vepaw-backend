import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { BrevoEmailService } from '../../common/email/brevo-email.service';
import { S3Service } from '../../common/storage/s3.service';
import { SafepayService } from '../../common/payments/safepay.service';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Clinic, ClinicDocument } from '../../database/schemas/clinic.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { VetApplication, VetApplicationDocument } from '../../database/schemas/vet-application.schema';
import { CommissionTier, CommissionTierDocument } from '../../database/schemas/commission-tier.schema';
import { Broadcast, BroadcastDocument } from '../../database/schemas/broadcast.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import {
  ConsultationSession,
  ConsultationSessionDocument,
} from '../../database/schemas/consultation-session.schema';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../database/schemas/message.schema';
import { ChatGateway } from '../realtime/gateways/chat.gateway';
import { ServiceResponse, MessageResponse } from '../../shared/types';
import { CreateCommissionTierDto } from './dto/create-commission-tier.dto';
import { UpdateCommissionTierDto } from './dto/update-commission-tier.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';
import { ScheduleBroadcastDto } from './dto/schedule-broadcast.dto';

const AVATAR_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

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

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(VetApplication.name) private readonly vetApplicationModel: Model<VetApplicationDocument>,
    @InjectModel(CommissionTier.name) private readonly commissionTierModel: Model<CommissionTierDocument>,
    @InjectModel(Broadcast.name) private readonly broadcastModel: Model<BroadcastDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(ConsultationSession.name)
    private readonly consultationModel: Model<ConsultationSessionDocument>,
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    private readonly chatGateway: ChatGateway,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
    private readonly emailService: BrevoEmailService,
    private readonly s3Service: S3Service,
    private readonly safepayService: SafepayService,
  ) {}

  async getOverviewStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [users, vets, stores, monthOrders, monthAppts, monthConsults, pendingVets, pendingStores] = await Promise.all([
      this.userModel.countDocuments(),
      this.vetModel.countDocuments({ verified: true }),
      this.storeModel.countDocuments({ status: 'approved' }),
      this.orderModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.consultationModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.vetApplicationModel.countDocuments({ status: 'pending' }),
      this.storeModel.countDocuments({ status: 'pending' }),
    ]);
    // Previously only Order + Appointment — consultation revenue was never counted here at
    // all, undercounting relative to every other admin money view. ?? 0 guards against a
    // record with a missing numeric field turning the whole sum into NaN.
    const gmv =
      monthOrders.reduce((s, o) => s + (o.totalAmount ?? 0), 0) +
      monthAppts.reduce((s, a) => s + (a.fee ?? 0), 0) +
      monthConsults.reduce((s, c) => s + (c.amount ?? 0), 0);
    return {
      data: {
        gmvThisMonth: `PKR ${gmv.toLocaleString()}`, gmvChange: 0, gmvComparison: 'vs last month',
        activeUsers: users, usersChange: 0, usersPeriod: 'this month',
        activeVets: vets, vetsChange: 0, vetsPending: pendingVets,
        activeStores: stores, storesChange: 0, storesPending: pendingStores,
      },
      message: 'Overview stats retrieved',
    };
  }

  async getGmvChart(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = new Date().getFullYear();
    // Previously only Order + Appointment — consultation revenue was never counted in this
    // chart at all. Excludes 'cancelled' the same way every other GMV calculation does.
    const [orders, appts, consults] = await Promise.all([
      this.orderModel.find({ createdAt: { $gte: new Date(year, 0, 1) }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: new Date(year, 0, 1) }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.consultationModel.find({ createdAt: { $gte: new Date(year, 0, 1) }, status: { $ne: 'cancelled' } }).lean().exec(),
    ]);
    const monthlyMap: Record<number, number> = {};
    for (const o of orders) { const m = o.createdAt.getMonth(); monthlyMap[m] = (monthlyMap[m] ?? 0) + (o.totalAmount ?? 0); }
    for (const a of appts) { const m = a.createdAt.getMonth(); monthlyMap[m] = (monthlyMap[m] ?? 0) + (a.fee ?? 0); }
    for (const c of consults) { const m = c.createdAt.getMonth(); monthlyMap[m] = (monthlyMap[m] ?? 0) + (c.amount ?? 0); }
    return { data: months.map((month, i) => ({ month, amount: monthlyMap[i] ?? 0 })), message: 'GMV chart retrieved' };
  }

  async getAttentionItems(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    // 'won' chargebacks need no follow-up (resolved in the platform's favor) — 'disputed'
    // (awaiting response) and 'lost' (money already forcibly reversed by the card network)
    // both do, across all three domains a chargeback can land on.
    const chargebackFilter = { chargebackStatus: { $in: ['disputed', 'lost'] as const } };
    const [pendingVets, pendingStores, overdueAppointments, disputedOrders, chargebacks] = await Promise.all([
      this.vetApplicationModel.countDocuments({ status: 'pending' }),
      this.storeModel.countDocuments({ status: 'pending' }),
      this.appointmentModel.countDocuments({ status: 'pending', date: { $lt: new Date().toISOString().slice(0, 10) } }),
      this.orderModel.countDocuments({ paymentStatus: 'refunded' }),
      Promise.all([
        this.orderModel.countDocuments(chargebackFilter),
        this.appointmentModel.countDocuments(chargebackFilter),
        this.consultationModel.countDocuments(chargebackFilter),
      ]).then(([orders, appts, consults]) => orders + appts + consults),
    ]);
    const items: Record<string, unknown>[] = [];
    if (pendingVets > 0) items.push({ type: 'pending_vets', count: pendingVets });
    if (pendingStores > 0) items.push({ type: 'pending_stores', count: pendingStores });
    if (overdueAppointments > 0) items.push({ type: 'overdue_appointments', count: overdueAppointments });
    if (disputedOrders > 0) items.push({ type: 'disputed_orders', count: disputedOrders });
    if (chargebacks > 0) items.push({ type: 'chargebacks', count: chargebacks });
    return { data: items, message: 'Attention items retrieved' };
  }

  async getAdminStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [pending, vets, users, monthOrders, monthAppts] = await Promise.all([
      this.vetApplicationModel.countDocuments({ status: 'pending' }),
      this.vetModel.countDocuments({ verified: true }),
      this.userModel.countDocuments(),
      this.orderModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
    ]);
    const oldest = await this.vetApplicationModel.findOne({ status: 'pending' }).sort({ createdAt: 1 }).lean().exec();
    const gmv = monthOrders.reduce((s, o) => s + o.totalAmount, 0) + monthAppts.reduce((s, a) => s + a.fee, 0);
    return {
      data: {
        pendingReview: pending, pendingOldest: oldest ? timeAgo(oldest.createdAt) : 'none',
        activeVets: vets, activeVetsChange: 0, activeVetsTotal: vets, activeVetsCity: 'Lahore',
        activeUsers: users, activeUsersChange: 0, activeUsersPeriod: 'this month',
        gmvThisMonth: `PKR ${gmv.toLocaleString()}`, gmvChange: 0, gmvComparison: 'vs last month',
      },
      message: 'Admin stats retrieved',
    };
  }

  async getVetApplications(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const apps = await this.vetApplicationModel.find().sort({ createdAt: -1 }).lean().exec();
    return {
      data: apps.map((a) => ({
        id: a._id.toString(), name: a.fullName, title: a.primaryQualification, clinicName: a.clinicName,
        area: a.area, submittedAgo: timeAgo(a.createdAt), feeFrom: a.feeMin, status: a.status,
      })),
      message: 'Vet applications retrieved',
    };
  }

  // ─── Store Applications ─────────────────────────────

  async getStoreApplications(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const stores = await this.storeModel.find().sort({ createdAt: -1 }).lean().exec();
    return {
      data: stores.map((s) => ({
        id: s._id.toString(),
        storeName: s.storeName,
        ownerName: s.ownerName,
        phone: s.phone,
        storeAddress: s.storeAddress,
        ntn: s.ntn,
        submittedAgo: timeAgo(s.createdAt),
        status: s.status,
      })),
      message: 'Store applications retrieved',
    };
  }

  async getStoreApplicationDetail(id: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(id).lean().exec();
    if (!store) throw new NotFoundException('Store application not found');

    return {
      data: {
        id: store._id.toString(),
        storeName: store.storeName,
        ownerName: store.ownerName,
        phone: store.phone,
        storeAddress: store.storeAddress,
        ntn: store.ntn,
        ownerCnic: store.ownerCnic,
        payoutMethod: store.payoutMethod,
        accountTitle: store.accountTitle,
        walletNumber: store.walletNumber,
        bankName: store.bankName,
        accountNumber: store.accountNumber,
        documents: {
          businessProof: store.businessProof,
        },
        submittedAt: store.createdAt.toISOString(),
        status: store.status,
        rejectionReason: store.rejectionReason,
      },
      message: 'Store application detail retrieved',
    };
  }

  async updateStoreApplicationStatus(id: string, status: string, reason?: string): Promise<ServiceResponse<null>> {
    const store = await this.storeModel.findById(id).exec();
    if (!store) throw new NotFoundException('Store application not found');

    store.status = status as 'approved' | 'rejected';
    if (status === 'rejected' && reason) {
      store.rejectionReason = reason;
    }
    await store.save();

    if (status === 'approved') {
      const token = await this.authService.generateSetPasswordToken('store', store._id.toString(), store.ownerName, store.email ?? store.phone, 'store_owner');
      if (store.email) {
        await this.emailService.sendStoreApprovalEmail(store.email, store.ownerName, token);
      }
    }

    if (status === 'rejected' && store.email) {
      await this.emailService.sendRejectionEmail(store.email, store.ownerName, reason);
    }

    return { data: null, message: `Store application ${status}` };
  }

  async getVetApplicationDetail(id: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const app = await this.vetApplicationModel.findById(id).lean().exec();
    if (!app) throw new NotFoundException('Application not found');

    // cnic is stored as a private S3 key (government ID, never a permanent public URL) — sign a
    // short-lived read URL for this reviewer rather than exposing the raw key.
    const cnicUrl = app.cnic ? await this.s3Service.getSignedReadUrl(app.cnic) : null;

    return {
      data: {
        id: app._id.toString(),
        name: app.fullName,
        phone: app.phone,
        email: app.email,
        clinicName: app.clinicName,
        city: app.city,
        area: app.area,
        fullAddress: app.fullAddress,
        lat: app.lat,
        lng: app.lng,
        specialisations: app.specialisations,
        feeMin: app.feeMin,
        feeMax: app.feeMax,
        languages: app.languages,
        pvmcNumber: app.pvmcNumber,
        yearsOfExperience: app.yearsOfExperience,
        primaryQualification: app.primaryQualification,
        university: app.university,
        additionalCertifications: app.additionalCertifications,
        documents: {
          pvmcLicense: app.pvmcLicense,
          degreeCertificate: app.degreeCertificate,
          cnic: cnicUrl,
          clinicPhoto: app.clinicPhoto,
        },
        submittedAt: app.createdAt.toISOString(),
        status: app.status,
        rejectionReason: app.rejectionReason,
      },
      message: 'Application detail retrieved',
    };
  }

  async rejectVetApplication(id: string): Promise<ServiceResponse<null>> {
    const app = await this.vetApplicationModel.findByIdAndUpdate(id, { status: 'rejected' }).exec();
    if (!app) throw new NotFoundException('Application not found');
    return { data: null, message: 'Application rejected' };
  }

  async getUsers(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).lean().exec();
    const petCounts = await this.petModel.aggregate([{ $group: { _id: '$owner', count: { $sum: 1 } } }]).exec();
    const petMap = new Map(petCounts.map((p) => [p._id.toString(), p.count as number]));
    const orderCounts = await this.orderModel.aggregate([{ $group: { _id: '$user', count: { $sum: 1 } } }]).exec();
    const orderMap = new Map(orderCounts.map((o) => [o._id.toString(), o.count as number]));
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return {
      data: users.map((u) => ({
        id: u._id.toString(), name: u.name || 'User', phone: u.phone, area: u.area,
        pets: petMap.get(u._id.toString()) ?? 0, orders: orderMap.get(u._id.toString()) ?? 0,
        joined: timeAgo(u.createdAt), status: u.createdAt > thirtyDaysAgo ? 'new' : 'active',
      })),
      message: 'Users retrieved',
    };
  }

  async getUserStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const total = await this.userModel.countDocuments();
    const withPets = await this.petModel.distinct('owner').exec();
    const repeatBuyers = await this.orderModel.aggregate([{ $group: { _id: '$user', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]).exec();
    return {
      data: {
        totalUsers: total, usersChange: 0, usersGrowth: 'this month',
        withPets: withPets.length, withPetsSubtitle: 'have registered pets',
        repeatBuyers: `${total > 0 ? Math.round((repeatBuyers.length / total) * 100) : 0}%`, repeatSubtitle: 'ordered more than once',
        suspended: 0, suspendedSubtitle: 'no suspended accounts',
      },
      message: 'User stats retrieved',
    };
  }

  async getTransactions(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const [orders, appts, consults] = await Promise.all([
      this.orderModel.find().sort({ createdAt: -1 }).limit(100).populate('user', 'name').lean().exec(),
      this.appointmentModel.find().sort({ createdAt: -1 }).limit(100).lean().exec(),
      this.consultationModel.find().sort({ createdAt: -1 }).limit(100).lean().exec(),
    ]);

    const petIds = [...new Set(consults.map((c) => c.pet.toString()))];
    const vetIds = [...new Set(consults.map((c) => c.vet.toString()))];
    const [pets, vets] = await Promise.all([
      petIds.length ? this.petModel.find({ _id: { $in: petIds } }).select('name').lean().exec() : [],
      vetIds.length ? this.vetModel.find({ _id: { $in: vetIds } }).select('name').lean().exec() : [],
    ]);
    const petNames = new Map(
      pets.map((p: { _id: Types.ObjectId; name: string }): [string, string] => [p._id.toString(), p.name]),
    );
    const vetNames = new Map(
      vets.map((v: { _id: Types.ObjectId; name: string }): [string, string] => [v._id.toString(), v.name]),
    );

    const txns: Record<string, unknown>[] = [];
    for (const o of orders) {
      const user = o.user as unknown as { name?: string } | null;
      txns.push({ id: o._id.toString(), ref: o.orderId, type: 'order', parties: `${user?.name ?? 'Customer'} → ${o.storeName}`, value: o.totalAmount, payment: o.paymentMethod, status: o.status });
    }
    for (const a of appts) {
      txns.push({ id: a._id.toString(), ref: `BK-${a._id.toString().slice(-6).toUpperCase()}`, type: 'booking', parties: `${a.petDetails.name} → ${a.vetDetails.name}`, value: a.fee, payment: a.paymentMethod, status: a.status });
    }
    for (const c of consults) {
      const petName = petNames.get(c.pet.toString()) ?? 'Pet';
      const vetName = vetNames.get(c.vet.toString()) ?? 'Vet';
      txns.push({
        id: c._id.toString(),
        ref: `CN-${c._id.toString().slice(-6).toUpperCase()}`,
        type: 'consultation',
        parties: `${petName} → ${vetName}`,
        value: c.amount,
        payment: 'safepay',
        status: c.status,
      });
    }

    txns.sort((a, b) => (b.id as string).localeCompare(a.id as string));
    return { data: txns.slice(0, 100), message: 'Transactions retrieved' };
  }

  async getTransactionStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfDay = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const [ordersToday, bookingsToday, consultationsToday, heldOrders, heldAppts, activeConsults, disputedAppts, disputedConsults] =
      await Promise.all([
        this.orderModel.countDocuments({ createdAt: { $gte: startOfDay } }),
        this.appointmentModel.countDocuments({ createdAt: { $gte: startOfDay } }),
        this.consultationModel.countDocuments({ createdAt: { $gte: startOfDay } }),
        this.orderModel.find({ status: { $in: ['confirmed', 'packed', 'dispatched'] } }).lean().exec(),
        this.appointmentModel.find({ paymentStatus: 'held' }).lean().exec(),
        this.consultationModel.find({ status: 'active' }).lean().exec(),
        this.appointmentModel.countDocuments({ status: 'disputed' }),
        this.consultationModel.countDocuments({ status: 'disputed' }),
      ]);
    // "In escrow" spans all three flows now, not just store orders — a held appointment or an
    // active (payment collected, not yet closed) consultation is just as much "money we're
    // holding" as a store order awaiting delivery confirmation.
    const escrow =
      heldOrders.reduce((s, o) => s + o.totalAmount, 0) +
      heldAppts.reduce((s, a) => s + a.fee, 0) +
      activeConsults.reduce((s, c) => s + c.amount, 0);
    const disputes = disputedAppts + disputedConsults;

    return {
      data: {
        ordersToday, ordersChange: 0, ordersVolume: `PKR ${(ordersToday * 1500).toLocaleString()}`,
        bookingsToday, bookingsSubtitle: 'appointments today',
        consultationsToday, consultationsSubtitle: 'paid consultations today',
        inEscrow: `PKR ${escrow.toLocaleString()}`, escrowSubtitle: 'held across orders, bookings & consultations',
        disputes, disputesSubtitle: disputes === 1 ? '1 active dispute' : `${disputes} active disputes`,
      },
      message: 'Transaction stats retrieved',
    };
  }

  async getCommissionTiers(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const tiers = await this.commissionTierModel.find().sort({ createdAt: 1 }).lean().exec();
    if (tiers.length === 0) {
      return { data: [
        { id: 'default-vet', tier: 'Vet Bookings', rate: '10%', appliesTo: 'All vet appointments' },
        { id: 'default-store', tier: 'Store Orders', rate: '10%', appliesTo: 'All store orders' },
      ], message: 'Commission tiers retrieved' };
    }
    return { data: tiers.map((t) => ({ id: t._id.toString(), tier: t.tier, rate: t.rate, appliesTo: t.appliesTo })), message: 'Commission tiers retrieved' };
  }

  async getCommissionStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    // Excludes 'cancelled' the same way every other GMV/commission calculation in this file
    // does — was previously unfiltered, so a cancelled order/appointment's commission counted
    // here forever. Consultations only exclude 'cancelled', not 'expired' (real, already-paid
    // revenue — see getReportStatsWithPeriod for the full reasoning).
    const [monthOrders, monthAppts, monthConsults, pendingPayouts] = await Promise.all([
      this.orderModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.consultationModel.find({ createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }).lean().exec(),
      this.payoutModel.find({ status: 'pending' }).lean().exec(),
    ]);
    // ?? 0 on every summed field: a record missing a numeric field (e.g. a pre-migration
    // document) would otherwise turn the whole sum into NaN, same class of bug already fixed
    // in getReportStatsWithPeriod.
    const totalCommission =
      monthOrders.reduce((s, o) => s + (o.platformCommission ?? 0), 0) +
      monthAppts.reduce((s, a) => s + (a.platformCommission ?? 0), 0) +
      monthConsults.reduce((s, c) => s + (c.platformCommission ?? 0), 0);
    const totalGmv =
      monthOrders.reduce((s, o) => s + (o.totalAmount ?? 0), 0) +
      monthAppts.reduce((s, a) => s + (a.fee ?? 0), 0) +
      monthConsults.reduce((s, c) => s + (c.amount ?? 0), 0);
    const takeRate = totalGmv > 0 ? ((totalCommission / totalGmv) * 100).toFixed(1) : '0';
    const pendingTotal = pendingPayouts.reduce((s, p) => s + (p.amount ?? 0), 0);
    return {
      data: {
        commissionThisMonth: `PKR ${totalCommission.toLocaleString()}`, commissionChange: 0, commissionSubtitle: 'this month',
        avgTakeRate: `${takeRate}%`, takeRateSubtitle: 'blended rate',
        pendingPayouts: `PKR ${pendingTotal.toLocaleString()}`, pendingSubtitle: 'due for payout',
      },
      message: 'Commission stats retrieved',
    };
  }

  async createCommissionTier(dto: CreateCommissionTierDto): Promise<ServiceResponse<null>> {
    await this.commissionTierModel.create(dto);
    return { data: null, message: 'Commission tier created' };
  }

  async updateCommissionTier(id: string, dto: UpdateCommissionTierDto): Promise<ServiceResponse<null>> {
    const tier = await this.commissionTierModel.findByIdAndUpdate(id, { $set: dto }).exec();
    if (!tier) throw new NotFoundException('Commission tier not found');
    return { data: null, message: 'Commission tier updated' };
  }

  // ─── Payouts ────────────────────────────────────────────

  async getPayouts(status?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const filter: Record<string, unknown> = status ? { status } : {};
    const payouts = await this.payoutModel.find(filter).sort({ createdAt: -1 }).lean().exec();

    const vetIds = payouts.filter((p) => p.entityType === 'vet').map((p) => p.entityId);
    const storeIds = payouts.filter((p) => p.entityType === 'store').map((p) => p.entityId);
    const [vets, stores] = await Promise.all([
      vetIds.length ? this.vetModel.find({ _id: { $in: vetIds } }).select('name clinicName').lean().exec() : [],
      storeIds.length ? this.storeModel.find({ _id: { $in: storeIds } }).select('storeName').lean().exec() : [],
    ]);
    const vetNames = new Map(
      vets.map((v: { _id: Types.ObjectId; name: string; clinicName?: string }): [string, string] => [
        v._id.toString(),
        v.clinicName || v.name,
      ]),
    );
    const storeNames = new Map(
      stores.map((s: { _id: Types.ObjectId; storeName: string }): [string, string] => [s._id.toString(), s.storeName]),
    );

    return {
      data: payouts.map((p) => ({
        id: p._id.toString(),
        entityType: p.entityType,
        entityName:
          p.entityType === 'vet'
            ? (vetNames.get(p.entityId.toString()) ?? 'Unknown vet')
            : (storeNames.get(p.entityId.toString()) ?? 'Unknown store'),
        label: p.label,
        date: p.date,
        method: p.method,
        orders: p.orders,
        gross: p.gross,
        commission: p.commission,
        netPaid: p.netPaid,
        amount: p.amount,
        status: p.status,
        transactionReference: p.transactionReference,
        settledAt: p.settledAt,
      })),
      message: 'Payouts retrieved',
    };
  }

  // Admin confirms the manual bank/wallet transfer was actually sent — this is the step that
  // closes the loop, since neither Safepay nor this platform can disburse funds automatically yet.
  async settlePayout(id: string, adminId: string, transactionReference?: string): Promise<ServiceResponse<null>> {
    const payout = await this.payoutModel.findById(id).exec();
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status === 'completed') {
      throw new BadRequestException({ message: 'Payout already settled', code: 'ALREADY_SETTLED' });
    }

    payout.status = 'completed';
    payout.transactionReference = transactionReference ?? null;
    payout.settledAt = new Date();
    payout.settledBy = new Types.ObjectId(adminId);
    await payout.save();

    return { data: null, message: 'Payout marked as settled' };
  }

  async getBroadcasts(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const broadcasts = await this.broadcastModel.find().sort({ createdAt: -1 }).lean().exec();
    return {
      data: broadcasts.map((b) => ({
        id: b._id.toString(), campaign: b.campaign, audience: b.audience.join(', '),
        when: b.status === 'scheduled' ? b.scheduledAt : timeAgo(b.createdAt),
        openRate: b.openRate, status: b.status,
      })),
      message: 'Broadcasts retrieved',
    };
  }

  async sendBroadcast(dto: SendBroadcastDto): Promise<ServiceResponse<null>> {
    await this.broadcastModel.create({ campaign: dto.title, title: dto.title, message: dto.message, audience: dto.audience, channels: dto.channels, status: 'sent' });
    return { data: null, message: 'Broadcast sent' };
  }

  async scheduleBroadcast(dto: ScheduleBroadcastDto): Promise<ServiceResponse<null>> {
    await this.broadcastModel.create({ campaign: dto.title, title: dto.title, message: dto.message, audience: dto.audience, channels: dto.channels, scheduledAt: dto.scheduledAt, status: 'scheduled' });
    return { data: null, message: 'Broadcast scheduled' };
  }

  async getReportStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const [ytdOrders, ytdAppts] = await Promise.all([
      this.orderModel.find({ createdAt: { $gte: startOfYear } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfYear } }).lean().exec(),
    ]);
    const gmvYtd = ytdOrders.reduce((s, o) => s + o.totalAmount, 0) + ytdAppts.reduce((s, a) => s + a.fee, 0);
    const totalCommission = ytdOrders.reduce((s, o) => s + o.platformCommission, 0) + ytdAppts.reduce((s, a) => s + a.platformCommission, 0);
    const takeRate = gmvYtd > 0 ? ((totalCommission / gmvYtd) * 100).toFixed(1) : '0';
    const orderCount = ytdOrders.length + ytdAppts.length;
    const avgOrder = orderCount > 0 ? Math.round(gmvYtd / orderCount) : 0;
    return {
      data: {
        gmvYtd: `PKR ${gmvYtd.toLocaleString()}`, gmvChange: 0, gmvPeriod: `Jan – ${new Date().toLocaleString('en', { month: 'short' })} ${year}`,
        takeRate: `${takeRate}%`, takeRateSubtitle: 'blended commission',
        avgOrder: `PKR ${avgOrder.toLocaleString()}`, avgOrderChange: '0%',
        retention: '0%', retentionChange: '0%', retentionSubtitle: '30-day retention',
      },
      message: 'Report stats retrieved',
    };
  }

  // Keyed off Order.deliveryAddress rather than User.area — the profile-level area field
  // defaults to '' and is never collected at OTP signup, so it was empty for most accounts and
  // pushed ~80% of the breakdown into "Unknown". deliveryAddress is required on every order and
  // reflects where business actually happened, not just whether a user filled in their profile.
  async getAreaBreakdown(
    dateFilter?: Record<string, unknown> | null,
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const orders = await this.orderModel
      .find({
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        status: { $ne: 'cancelled' },
      })
      .select('deliveryAddress')
      .lean()
      .exec();
    const areaCounts: Record<string, number> = {};
    for (const o of orders) {
      const key = o.deliveryAddress?.area || o.deliveryAddress?.city || 'Unknown';
      areaCounts[key] = (areaCounts[key] ?? 0) + 1;
    }
    const total = orders.length || 1;
    return {
      data: Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, percent: Math.round((count / total) * 100) })),
      message: 'Area breakdown retrieved',
    };
  }

  // Was missing ConsultationSession entirely — a telehealth-heavy period showed as 100%
  // "Products" with bookings undercounted, since consultations weren't in the denominator at
  // all. Also now excludes cancelled/expired records from every bucket, consistent with the
  // GMV/take-rate fix in getReportStatsWithPeriod below.
  async getCategoryBreakdown(
    dateFilter?: Record<string, unknown> | null,
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const baseFilter = dateFilter ? { createdAt: dateFilter } : {};
    const [apptCount, consultCount, orderItemAgg] = await Promise.all([
      this.appointmentModel.countDocuments({
        ...baseFilter,
        status: { $ne: 'cancelled' },
      }),
      // 'expired' is real, already-paid revenue — a session only ever reaches 'expired' from
      // 'active', which itself is only reachable after a real payment.succeeded. Only
      // 'cancelled' represents no net revenue (either never charged, or charged-then-refunded
      // via a rejected dispute) — correcting an earlier version of this fix that wrongly
      // excluded 'expired' too.
      this.consultationModel.countDocuments({
        ...baseFilter,
        status: { $ne: 'cancelled' },
      }),
      this.orderModel
        .aggregate([
          { $match: { ...baseFilter, status: { $ne: 'cancelled' } } },
          { $unwind: '$items' },
          { $group: { _id: null, count: { $sum: '$items.qty' } } },
        ])
        .exec(),
    ]);
    const prodCount = orderItemAgg[0]?.count ?? 0;
    const total = prodCount + apptCount + consultCount || 1;
    const colors = ['#6366F1', '#F59E0B', '#10B981'];
    const data: Record<string, unknown>[] = [];
    if (prodCount > 0) {
      data.push({
        name: 'Products',
        percent: Math.round((prodCount / total) * 100),
        color: colors[0],
      });
    }
    if (apptCount > 0) {
      data.push({
        name: 'Bookings',
        percent: Math.round((apptCount / total) * 100),
        color: colors[1],
      });
    }
    if (consultCount > 0) {
      data.push({
        name: 'Consultations',
        percent: Math.round((consultCount / total) * 100),
        color: colors[2],
      });
    }
    return { data, message: 'Category breakdown retrieved' };
  }

  async adminLogin(email: string, password: string): Promise<ServiceResponse<{ token: string; role: string; redirectTo: string; name: string }>> {
    const admin = await this.userModel
      .findOne({ email, role: 'admin' })
      .select('+password')
      .exec();

    if (!admin || !admin.password) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const payload = { sub: admin._id.toString(), phone: admin.phone, role: 'admin' as const };
    const token = this.jwtService.sign(payload);

    return { data: { token, role: 'platform_admin', redirectTo: '/admin', name: admin.name }, message: 'Login successful' };
  }

  // ─── Missing Endpoints ────────────────────────────────

  async updateVetApplicationStatus(id: string, status: string, reason?: string): Promise<ServiceResponse<null>> {
    const app = await this.vetApplicationModel.findById(id).exec();
    if (!app) throw new NotFoundException('Application not found');
    app.status = status as 'approved' | 'rejected';
    if (status === 'rejected' && reason) {
      app.rejectionReason = reason;
    }
    await app.save();

    if (status === 'approved') {
      let vetId: string;
      const existing = await this.vetModel.findOne({ email: app.email }).exec();
      if (existing) {
        existing.verified = true; existing.applicationStatus = 'approved'; existing.subscriptionStatus = 'active';
        // Defensive: an already-linked vet (e.g. one created via the team-invite flow)
        // must not get a second orphan clinic on re-approval.
        if (!existing.clinicId) {
          const clinic = await this.clinicModel.create({
            name: app.clinicName,
            payoutMethod: app.payoutMethod,
            accountTitle: app.accountTitle,
            walletNumber: app.walletNumber,
            bankName: app.bankName,
            accountNumber: app.accountNumber,
            cnicOnAccount: app.cnicOnAccount,
            ownerId: existing._id,
          });
          existing.clinicId = clinic._id as Types.ObjectId;
          existing.staffRole = 'admin_vet';
        }
        await existing.save();
        vetId = existing._id.toString();
      } else {
        const newVet = await this.vetModel.create({
          name: app.fullName, clinicName: app.clinicName, email: app.email, phone: app.phone,
          address: app.fullAddress, city: app.city, area: app.area,
          fee: { min: app.feeMin, max: app.feeMax }, specializations: app.specialisations,
          languages: app.languages, yearsExperience: app.yearsOfExperience,
          pvmcNumber: app.pvmcNumber, primaryQualification: app.primaryQualification,
          university: app.university, verified: true, applicationStatus: 'approved', subscriptionStatus: 'active',
          // Applications submitted before the pin-drop picker shipped have no lat/lng — omit the
          // key entirely so Mongoose falls back to the schema default rather than writing a null
          // location, matching pre-existing behavior for those.
          ...(app.lat != null && app.lng != null
            ? {
                location: {
                  type: 'Point' as const,
                  coordinates: [app.lng, app.lat],
                },
              }
            : {}),
        });
        const clinic = await this.clinicModel.create({
          name: app.clinicName,
          payoutMethod: app.payoutMethod,
          accountTitle: app.accountTitle,
          walletNumber: app.walletNumber,
          bankName: app.bankName,
          accountNumber: app.accountNumber,
          cnicOnAccount: app.cnicOnAccount,
          ownerId: newVet._id,
        });
        newVet.clinicId = clinic._id as Types.ObjectId;
        newVet.staffRole = 'admin_vet';
        await newVet.save();
        vetId = newVet._id.toString();
      }

      const token = await this.authService.generateSetPasswordToken('vet', vetId, app.fullName, app.email, 'vet_admin');
      await this.emailService.sendSetPasswordEmail(app.email, app.fullName, token, 'vet_admin');
    }

    if (status === 'rejected') {
      await this.emailService.sendRejectionEmail(app.email, app.fullName, reason);
    }

    return { data: null, message: `Application ${status}` };
  }

  async updateUserStatus(userId: string, status: string): Promise<ServiceResponse<null>> {
    return { data: null, message: `User ${status}` };
  }

  async updateTransactionStatus(transactionId: string, status: string): Promise<ServiceResponse<null>> {
    const order = await this.orderModel.findByIdAndUpdate(transactionId, { status }).exec();
    if (!order) {
      const appt = await this.appointmentModel.findByIdAndUpdate(transactionId, { status: status === 'delivered' ? 'completed' : status }).exec();
      if (!appt) {
        // Was previously missing entirely — getTransactions() lists consultations in the same
        // table as orders/appointments, but any status-update action on one silently 404'd.
        const consult = await this.consultationModel.findByIdAndUpdate(transactionId, { status }).exec();
        if (!consult) throw new NotFoundException('Transaction not found');
      }
    }
    return { data: null, message: `Transaction ${status}` };
  }

  async releaseEscrow(transactionId: string): Promise<ServiceResponse<null>> {
    const order = await this.orderModel.findById(transactionId).exec();
    if (order && order.status === 'delivered') {
      order.paymentStatus = 'paid';
      await order.save();
      return { data: null, message: 'Escrow released' };
    }
    const appt = await this.appointmentModel.findById(transactionId).exec();
    if (appt && appt.status === 'completed') {
      appt.paymentStatus = 'released';
      await appt.save();
      return { data: null, message: 'Escrow released' };
    }
    // Consultations have no manual-release concept to fix here — payout eligibility is fully
    // automatic once status reaches 'closed'/'expired' (see batchPayoutForVet()), there's no
    // held/released distinction to force. A clear reason instead of a generic 404 if an admin
    // clicks this on a consultation row.
    const consult = await this.consultationModel.findById(transactionId).lean().exec();
    if (consult) {
      throw new BadRequestException({
        message: 'Consultations do not support manual escrow release — payout becomes eligible automatically once the session closes',
        code: 'NOT_APPLICABLE',
      });
    }
    throw new NotFoundException('Transaction not found or not eligible for release');
  }

  async resolveDisputedConsultation(
    sessionId: string,
    adminId: string,
    outcome: 'approve' | 'reject',
  ): Promise<ServiceResponse<null>> {
    const now = new Date();

    if (outcome === 'approve') {
      const updated = await this.consultationModel.findOneAndUpdate(
        { _id: new Types.ObjectId(sessionId), status: 'disputed' },
        {
          $set: {
            status: 'active' as const,
            paidAt: now,
            startedAt: now,
            autoExpireAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            adminResolvedBy: new Types.ObjectId(adminId),
            adminResolvedAt: now,
          },
        },
        { new: true },
      ).exec();

      if (!updated) {
        const exists = await this.consultationModel.findById(sessionId).lean().exec();
        if (!exists) throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        throw new BadRequestException({
          message: 'This session is not currently disputed — it may have already been resolved',
          code: 'INVALID_STATUS',
        });
      }

      await this.postConsultationStatusMessage(updated, 'active', 'Payment dispute resolved — consultation started');
      return { data: null, message: 'Disputed consultation approved' };
    }

    // outcome === 'reject': refund before committing the resolution — same pattern as
    // appointment/order cancellation. refundRequired previously got set to true
    // unconditionally here and nothing anywhere ever consumed it, so a rejected dispute never
    // actually resulted in money moving. Now it's only true on a genuine refund failure, as a
    // manual-follow-up flag — the resolution itself still proceeds either way, since an admin
    // closing out a dispute case shouldn't be blocked by a transient Safepay error the way a
    // customer-initiated cancel is.
    const session = await this.consultationModel
      .findOne({ _id: new Types.ObjectId(sessionId), status: 'disputed' })
      .exec();
    if (!session) {
      const exists = await this.consultationModel.findById(sessionId).lean().exec();
      if (!exists) throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
      throw new BadRequestException({
        message: 'This session is not currently disputed — it may have already been resolved',
        code: 'INVALID_STATUS',
      });
    }

    let refundRequired = false;
    if (session.paymentReference) {
      try {
        await this.safepayService.refundPayment(session.paymentReference, session.amount);
      } catch (err) {
        this.logger.error(
          `Refund failed for rejected consultation dispute ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        refundRequired = true;
      }
    } else {
      this.logger.error(`Disputed consultation ${sessionId} rejected but has no paymentReference — cannot refund automatically`);
      refundRequired = true;
    }

    // 'cancelled', not 'expired' — ConsultationSession has no separate paymentStatus field, so
    // this single status value doubles as the payout-eligibility gate in
    // VetPortalService.batchPayoutForVet() / autoBatchWeeklyPayouts() ({$in:['closed','expired']}).
    // A rejected-and-refunded session landing on 'expired' would still be swept into the vet's
    // next payout batch — refunding the customer AND paying the vet for the same transaction.
    // 'cancelled' is already excluded from every payout query and every GMV calculation.
    const updated = await this.consultationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(sessionId), status: 'disputed' },
      {
        $set: {
          status: 'cancelled' as const,
          refundRequired,
          adminResolvedBy: new Types.ObjectId(adminId),
          adminResolvedAt: now,
          closedBy: 'admin' as const,
          closedAt: now,
        },
      },
      { new: true },
    ).exec();

    if (!updated) {
      throw new BadRequestException({
        message: 'This session is not currently disputed — it may have already been resolved',
        code: 'INVALID_STATUS',
      });
    }

    await this.postConsultationStatusMessage(updated, 'cancelled', 'Payment dispute rejected — consultation ended');

    return { data: null, message: 'Disputed consultation rejected' };
  }

  async resolveDisputedAppointment(
    appointmentId: string,
    adminId: string,
    outcome: 'release' | 'refund',
  ): Promise<ServiceResponse<null>> {
    const now = new Date();

    // 'release' never needed a Safepay call — the held payment already belongs to the vet in
    // this outcome, it's just no longer blocked as disputed. Safe to resolve directly.
    //
    // Both outcomes return status to 'completed' — disputeAppointment() only ever moves an
    // appointment INTO 'disputed' from 'completed' in the first place (the visit itself already
    // happened either way), so resolution reverses that transition regardless of which way the
    // payment goes. paymentStatus (released vs refunded) carries the financial outcome.
    if (outcome === 'release') {
      const updated = await this.appointmentModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(appointmentId), status: 'disputed' },
          {
            $set: {
              status: 'completed',
              paymentStatus: 'released',
              adminResolvedBy: new Types.ObjectId(adminId),
              adminResolvedAt: now,
            },
          },
          { new: true },
        )
        .exec();

      if (!updated) {
        const exists = await this.appointmentModel.findById(appointmentId).lean().exec();
        if (!exists) {
          throw new NotFoundException({ message: 'Appointment not found', code: 'APPOINTMENT_NOT_FOUND' });
        }
        throw new BadRequestException({
          message: 'This appointment is not currently disputed — it may have already been resolved',
          code: 'INVALID_STATUS',
        });
      }

      return { data: null, message: 'Disputed appointment payout released' };
    }

    // outcome === 'refund': previously just set paymentStatus: 'refunded' as a label with no
    // Safepay call — the exact bug class already fixed elsewhere this session for
    // appointment/order cancellation and the consultation dispute-reject path, missed here
    // until now. Refund before committing the resolution — if Safepay fails, the appointment
    // stays 'disputed' so admin can retry, instead of claiming refunded while no money moved.
    const appointment = await this.appointmentModel
      .findOne({ _id: new Types.ObjectId(appointmentId), status: 'disputed' })
      .exec();
    if (!appointment) {
      const exists = await this.appointmentModel.findById(appointmentId).lean().exec();
      if (!exists) {
        throw new NotFoundException({ message: 'Appointment not found', code: 'APPOINTMENT_NOT_FOUND' });
      }
      throw new BadRequestException({
        message: 'This appointment is not currently disputed — it may have already been resolved',
        code: 'INVALID_STATUS',
      });
    }

    if (!appointment.paymentReference) {
      this.logger.error(`Disputed appointment ${appointmentId} refund requested but has no paymentReference — cannot refund automatically`);
      throw new UnprocessableEntityException({
        message: 'Unable to process the refund right now — please try again shortly',
        code: 'REFUND_FAILED',
      });
    }

    try {
      await this.safepayService.refundPayment(appointment.paymentReference, appointment.fee);
    } catch (err) {
      this.logger.error(
        `Refund failed for disputed appointment ${appointmentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnprocessableEntityException({
        message: 'Unable to process the refund right now — please try again shortly',
        code: 'REFUND_FAILED',
      });
    }

    appointment.status = 'completed';
    appointment.paymentStatus = 'refunded';
    appointment.adminResolvedBy = new Types.ObjectId(adminId);
    appointment.adminResolvedAt = now;
    await appointment.save();

    return { data: null, message: 'Disputed appointment refunded' };
  }

  private async postConsultationStatusMessage(
    session: ConsultationSessionDocument,
    status: ConsultationSessionDocument['status'],
    previewText: string,
  ): Promise<void> {
    const threadId = session.thread as Types.ObjectId;
    const sender = 'doctor' as const;

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

  async deleteCommissionTier(id: string): Promise<ServiceResponse<null>> {
    const tier = await this.commissionTierModel.findByIdAndDelete(id).exec();
    if (!tier) throw new NotFoundException('Commission tier not found');
    return { data: null, message: 'Commission tier deleted' };
  }

  async getBroadcastOptions(): Promise<ServiceResponse<{ audiences: string[]; channels: string[] }>> {
    return {
      data: {
        audiences: ['All Users', 'Pet Owners', 'Vet Clients', 'Store Customers', 'Inactive Users'],
        channels: ['Push Notification', 'Email', 'SMS'],
      },
      message: 'Broadcast options retrieved',
    };
  }

  async getReportStatsWithPeriod(period?: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const dateFilter = this.getPeriodFilter(period ?? 'ytd');
    const baseFilter = dateFilter ? { createdAt: dateFilter } : {};
    // Excluding cancelled records isn't just cosmetic — a cancelled order's totalAmount was
    // previously counted as real GMV forever, which is how a single cancelled test/junk order
    // can single-handedly blow out avgOrder (its totalAmount / a small order count).
    // Consultations: only 'cancelled' means no net revenue (never charged, or charged-then-
    // refunded via a rejected dispute) — 'expired' is real, already-paid revenue (only
    // reachable from 'active', itself only reachable after payment.succeeded), so it must NOT
    // be excluded the way it previously was here.
    const [orders, appts, consults] = await Promise.all([
      this.orderModel.find({ ...baseFilter, status: { $ne: 'cancelled' } }).lean().exec(),
      this.appointmentModel.find({ ...baseFilter, status: { $ne: 'cancelled' } }).lean().exec(),
      this.consultationModel.find({ ...baseFilter, status: { $ne: 'cancelled' } }).lean().exec(),
    ]);
    // ?? 0 on every summed field: any record missing a numeric field (e.g. a pre-migration
    // document written before platformCommission existed on its schema) previously turned the
    // whole reduce() into NaN, which is why takeRate rendered as the literal string "NaN%".
    const gmv =
      orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0) +
      appts.reduce((s, a) => s + (a.fee ?? 0), 0) +
      consults.reduce((s, c) => s + (c.amount ?? 0), 0);
    const commission =
      orders.reduce((s, o) => s + (o.platformCommission ?? 0), 0) +
      appts.reduce((s, a) => s + (a.platformCommission ?? 0), 0) +
      consults.reduce((s, c) => s + (c.platformCommission ?? 0), 0);
    const takeRate = gmv > 0 ? ((commission / gmv) * 100).toFixed(1) : '0';
    const count = orders.length + appts.length + consults.length;
    const avgOrder = count > 0 ? Math.round(gmv / count) : 0;
    return {
      data: {
        gmvYtd: `PKR ${gmv.toLocaleString()}`, gmvChange: 0, gmvPeriod: period ?? 'ytd',
        takeRate: `${takeRate}%`, takeRateSubtitle: 'blended commission',
        avgOrder: `PKR ${avgOrder.toLocaleString()}`, avgOrderChange: '0%',
        // Not computed — no prior-period comparison or cohort-retention logic exists anywhere
        // in this codebase yet. Left as an explicit '0%' placeholder rather than a fabricated
        // number; a real fix needs a decision on what "30-day retention" should mean here first.
        retention: '0%', retentionChange: '0%', retentionSubtitle: '30-day retention',
      },
      message: 'Report stats retrieved',
    };
  }

  async getAreaBreakdownWithPeriod(period?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    return this.getAreaBreakdown(this.getPeriodFilter(period ?? 'ytd'));
  }

  async getCategoryBreakdownWithPeriod(period?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    return this.getCategoryBreakdown(this.getPeriodFilter(period ?? 'ytd'));
  }

  private getPeriodFilter(period: string): Record<string, unknown> | null {
    const now = new Date();
    if (period === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start, $lt: end };
    }
    if (period === 'ytd') return { $gte: new Date(now.getFullYear(), 0, 1) };
    if (period === 'lastQuarter') {
      const d = new Date(); d.setMonth(d.getMonth() - 3);
      return { $gte: d };
    }
    return null;
  }
}
