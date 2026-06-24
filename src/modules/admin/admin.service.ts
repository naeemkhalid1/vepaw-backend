import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../common/email/email.service';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { VetApplication, VetApplicationDocument } from '../../database/schemas/vet-application.schema';
import { CommissionTier, CommissionTierDocument } from '../../database/schemas/commission-tier.schema';
import { Broadcast, BroadcastDocument } from '../../database/schemas/broadcast.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import { ServiceResponse } from '../../shared/types';
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
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(VetApplication.name) private readonly vetApplicationModel: Model<VetApplicationDocument>,
    @InjectModel(CommissionTier.name) private readonly commissionTierModel: Model<CommissionTierDocument>,
    @InjectModel(Broadcast.name) private readonly broadcastModel: Model<BroadcastDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  async getOverviewStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [users, vets, stores, monthOrders, monthAppts, pendingVets, pendingStores] = await Promise.all([
      this.userModel.countDocuments(),
      this.vetModel.countDocuments({ verified: true }),
      this.storeModel.countDocuments({ status: 'approved' }),
      this.orderModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.vetApplicationModel.countDocuments({ status: 'pending' }),
      this.storeModel.countDocuments({ status: 'pending' }),
    ]);
    const gmv = monthOrders.reduce((s, o) => s + o.totalAmount, 0) + monthAppts.reduce((s, a) => s + a.fee, 0);
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
    const [orders, appts] = await Promise.all([
      this.orderModel.find({ createdAt: { $gte: new Date(year, 0, 1) } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: new Date(year, 0, 1) } }).lean().exec(),
    ]);
    const monthlyMap: Record<number, number> = {};
    for (const o of orders) { const m = o.createdAt.getMonth(); monthlyMap[m] = (monthlyMap[m] ?? 0) + o.totalAmount; }
    for (const a of appts) { const m = a.createdAt.getMonth(); monthlyMap[m] = (monthlyMap[m] ?? 0) + a.fee; }
    return { data: months.map((month, i) => ({ month, amount: monthlyMap[i] ?? 0 })), message: 'GMV chart retrieved' };
  }

  async getAttentionItems(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const [pendingVets, pendingStores, overdueAppointments, disputedOrders] = await Promise.all([
      this.vetApplicationModel.countDocuments({ status: 'pending' }),
      this.storeModel.countDocuments({ status: 'pending' }),
      this.appointmentModel.countDocuments({ status: 'pending', date: { $lt: new Date().toISOString().slice(0, 10) } }),
      this.orderModel.countDocuments({ paymentStatus: 'refunded' }),
    ]);
    const items: Record<string, unknown>[] = [];
    if (pendingVets > 0) items.push({ type: 'pending_vets', count: pendingVets });
    if (pendingStores > 0) items.push({ type: 'pending_stores', count: pendingStores });
    if (overdueAppointments > 0) items.push({ type: 'overdue_appointments', count: overdueAppointments });
    if (disputedOrders > 0) items.push({ type: 'disputed_orders', count: disputedOrders });
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
        merchantAccount: store.merchantAccount,
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
          cnic: app.cnic,
          clinicPhoto: app.clinicPhoto,
        },
        submittedAt: app.createdAt.toISOString(),
        status: app.status,
        rejectionReason: app.rejectionReason,
      },
      message: 'Application detail retrieved',
    };
  }

  async approveVetApplication(id: string): Promise<ServiceResponse<null>> {
    const app = await this.vetApplicationModel.findById(id).exec();
    if (!app) throw new NotFoundException('Application not found');
    app.status = 'approved';
    await app.save();
    const existing = await this.vetModel.findOne({ email: app.email }).exec();
    if (existing) {
      existing.verified = true; existing.applicationStatus = 'approved'; existing.subscriptionStatus = 'active';
      await existing.save();
    } else {
      await this.vetModel.create({
        name: app.fullName, clinicName: app.clinicName, email: app.email, phone: app.phone,
        address: app.fullAddress, city: app.city, area: app.area,
        fee: { min: app.feeMin, max: app.feeMax }, specializations: app.specialisations,
        languages: app.languages, yearsExperience: app.yearsOfExperience,
        pvmcNumber: app.pvmcNumber, primaryQualification: app.primaryQualification,
        university: app.university, verified: true, applicationStatus: 'approved', subscriptionStatus: 'active',
      });
    }
    return { data: null, message: 'Application approved' };
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
    const [orders, appts] = await Promise.all([
      this.orderModel.find().sort({ createdAt: -1 }).limit(100).populate('user', 'name').lean().exec(),
      this.appointmentModel.find().sort({ createdAt: -1 }).limit(100).lean().exec(),
    ]);
    const txns: Record<string, unknown>[] = [];
    for (const o of orders) {
      const user = o.user as unknown as { name?: string } | null;
      txns.push({ id: o._id.toString(), ref: o.orderId, type: 'order', parties: `${user?.name ?? 'Customer'} → ${o.storeName}`, value: o.totalAmount, payment: o.paymentMethod, status: o.status });
    }
    for (const a of appts) {
      txns.push({ id: a._id.toString(), ref: `BK-${a._id.toString().slice(-6).toUpperCase()}`, type: 'booking', parties: `${a.petDetails.name} → ${a.vetDetails.name}`, value: a.fee, payment: a.paymentMethod, status: a.status });
    }
    return { data: txns.slice(0, 100), message: 'Transactions retrieved' };
  }

  async getTransactionStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfDay = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const [ordersToday, bookingsToday, heldOrders] = await Promise.all([
      this.orderModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.appointmentModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.orderModel.find({ status: { $in: ['confirmed', 'packed', 'dispatched'] } }).lean().exec(),
    ]);
    const escrow = heldOrders.reduce((s, o) => s + o.totalAmount, 0);
    return {
      data: {
        ordersToday, ordersChange: 0, ordersVolume: `PKR ${(ordersToday * 1500).toLocaleString()}`,
        bookingsToday, bookingsSubtitle: 'appointments today',
        inEscrow: `PKR ${escrow.toLocaleString()}`, escrowSubtitle: 'held for delivery confirmation',
        disputes: 0, disputesSubtitle: 'no active disputes',
      },
      message: 'Transaction stats retrieved',
    };
  }

  async getCommissionTiers(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const tiers = await this.commissionTierModel.find().sort({ createdAt: 1 }).lean().exec();
    if (tiers.length === 0) {
      return { data: [
        { id: 'default-vet', tier: 'Vet Bookings', rate: '15%', appliesTo: 'All vet appointments' },
        { id: 'default-store', tier: 'Store Orders', rate: '0%', appliesTo: 'All store orders' },
      ], message: 'Commission tiers retrieved' };
    }
    return { data: tiers.map((t) => ({ id: t._id.toString(), tier: t.tier, rate: t.rate, appliesTo: t.appliesTo })), message: 'Commission tiers retrieved' };
  }

  async getCommissionStats(): Promise<ServiceResponse<Record<string, unknown>>> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [monthOrders, monthAppts, pendingPayouts] = await Promise.all([
      this.orderModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.appointmentModel.find({ createdAt: { $gte: startOfMonth } }).lean().exec(),
      this.payoutModel.find({ status: 'pending' }).lean().exec(),
    ]);
    const totalCommission = monthOrders.reduce((s, o) => s + o.platformCommission, 0) + monthAppts.reduce((s, a) => s + a.platformCommission, 0);
    const totalGmv = monthOrders.reduce((s, o) => s + o.totalAmount, 0) + monthAppts.reduce((s, a) => s + a.fee, 0);
    const takeRate = totalGmv > 0 ? ((totalCommission / totalGmv) * 100).toFixed(1) : '0';
    const pendingTotal = pendingPayouts.reduce((s, p) => s + p.amount, 0);
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

  async getAreaBreakdown(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const users = await this.userModel.find().select('area').lean().exec();
    const areaCounts: Record<string, number> = {};
    for (const u of users) { areaCounts[u.area || 'Unknown'] = (areaCounts[u.area || 'Unknown'] ?? 0) + 1; }
    const total = users.length || 1;
    return {
      data: Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, percent: Math.round((count / total) * 100) })),
      message: 'Area breakdown retrieved',
    };
  }

  async getCategoryBreakdown(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const apptCount = await this.appointmentModel.countDocuments();
    const orderItemCount = await this.orderModel.aggregate([{ $unwind: '$items' }, { $group: { _id: null, count: { $sum: '$items.qty' } } }]).exec();
    const prodCount = orderItemCount[0]?.count ?? 0;
    const total = prodCount + apptCount || 1;
    const colors = ['#6366F1', '#F59E0B', '#10B981'];
    const data: Record<string, unknown>[] = [];
    if (prodCount > 0) data.push({ name: 'Products', percent: Math.round((prodCount / total) * 100), color: colors[0] });
    if (apptCount > 0) data.push({ name: 'Bookings', percent: Math.round((apptCount / total) * 100), color: colors[1] });
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
        });
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
      if (!appt) throw new NotFoundException('Transaction not found');
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
    throw new NotFoundException('Transaction not found or not eligible for release');
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
    const [orders, appts] = await Promise.all([
      this.orderModel.find(dateFilter ? { createdAt: dateFilter } : {}).lean().exec(),
      this.appointmentModel.find(dateFilter ? { createdAt: dateFilter } : {}).lean().exec(),
    ]);
    const gmv = orders.reduce((s, o) => s + o.totalAmount, 0) + appts.reduce((s, a) => s + a.fee, 0);
    const commission = orders.reduce((s, o) => s + o.platformCommission, 0) + appts.reduce((s, a) => s + a.platformCommission, 0);
    const takeRate = gmv > 0 ? ((commission / gmv) * 100).toFixed(1) : '0';
    const count = orders.length + appts.length;
    const avgOrder = count > 0 ? Math.round(gmv / count) : 0;
    return {
      data: {
        gmvYtd: `PKR ${gmv.toLocaleString()}`, gmvChange: 0, gmvPeriod: period ?? 'ytd',
        takeRate: `${takeRate}%`, takeRateSubtitle: 'blended commission',
        avgOrder: `PKR ${avgOrder.toLocaleString()}`, avgOrderChange: '0%',
        retention: '0%', retentionChange: '0%', retentionSubtitle: '30-day retention',
      },
      message: 'Report stats retrieved',
    };
  }

  async getAreaBreakdownWithPeriod(period?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    return this.getAreaBreakdown();
  }

  async getCategoryBreakdownWithPeriod(period?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    return this.getCategoryBreakdown();
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
