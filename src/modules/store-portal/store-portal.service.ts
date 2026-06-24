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
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { ServiceResponse } from '../../shared/types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';
import { StoreRegisterDto } from './dto/store-register.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { AcceptStoreInviteDto } from './dto/accept-store-invite.dto';
import {
  UpdateOrderStatusDto,
  UpdateSubscriptionStatusDto,
  UpdateProductStatusDto,
  UpdateTeamMemberStatusDto,
  UpdatePayoutAccountDto,
} from './dto/update-status.dto';

const AVATAR_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string): string {
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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getCategoryIcon(category: string): string {
  const map: Record<string, string> = { food: '🍖', medicine: '💊', accessories: '🎾', grooming: '✂️', treats: '🦴' };
  return map[category] ?? '📦';
}

function getCategoryBgColor(category: string): string {
  const map: Record<string, string> = { food: '#FEF3C7', medicine: '#DBEAFE', accessories: '#D1FAE5', grooming: '#FCE7F3', treats: '#FDE68A' };
  return map[category] ?? '#F3F4F6';
}

@Injectable()
export class StorePortalService {
  private readonly logger = new Logger(StorePortalService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Store.name) private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(Invite.name) private readonly inviteModel: Model<InviteDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ─── Orders ──────────────────────────────────────────────

  async getOrders(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const orders = await this.orderModel
      .find({ store: new Types.ObjectId(storeId), status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .populate('user', 'name area')
      .lean()
      .exec();

    const mapped = orders.map((o) => {
      const user = o.user as unknown as { name?: string; area?: string } | null;
      return {
        id: o._id.toString(),
        orderNumber: o.orderId,
        customerName: user?.name ?? 'Customer',
        customerArea: o.deliveryAddress?.area ?? user?.area ?? '',
        timeAgo: timeAgo(o.createdAt),
        itemCount: o.items.length,
        itemLabel: o.items.length === 1 ? '1 item' : `${o.items.length} items`,
        valuePkr: o.totalAmount,
        paymentMethod: o.paymentMethod,
        status: o.status,
      };
    });

    return { data: mapped, message: 'Orders retrieved' };
  }

  async getOrderStats(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [toPack, outToday, monthOrders] = await Promise.all([
      this.orderModel.countDocuments({ store: sid, status: 'confirmed' }),
      this.orderModel.countDocuments({ store: sid, status: 'dispatched', updatedAt: { $gte: startOfDay } }),
      this.orderModel.find({ store: sid, createdAt: { $gte: startOfMonth } }).lean().exec(),
    ]);

    const oldest = await this.orderModel
      .findOne({ store: sid, status: 'confirmed' })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const monthTotal = monthOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const monthCommission = monthOrders.reduce((sum, o) => sum + o.platformCommission, 0);
    const pendingPayout = monthOrders
      .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.storePayout, 0);

    return {
      data: {
        toPack,
        toPackOldest: oldest ? timeAgo(oldest.createdAt) : 'none',
        outToday,
        outTodayChange: 0,
        outTodayTotal: outToday,
        pendingPayout,
        pendingPayoutLabel: `PKR ${pendingPayout.toLocaleString()}`,
        thisMonth: `PKR ${monthTotal.toLocaleString()}`,
        thisMonthChange: 0,
        thisMonthCommission: `PKR ${monthCommission.toLocaleString()} commission`,
      },
      message: 'Order stats retrieved',
    };
  }

  async updateOrderStatus(storeId: string, orderId: string, status: string): Promise<ServiceResponse<null>> {
    const order = await this.orderModel.findOneAndUpdate(
      { _id: new Types.ObjectId(orderId), store: new Types.ObjectId(storeId) },
      { status },
    ).exec();
    if (!order) throw new NotFoundException('Order not found');
    return { data: null, message: `Order ${status}` };
  }

  // ─── Subscriptions ──────────────────────────────────────

  async getSubscriptions(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const orders = await this.orderModel
      .find({ store: new Types.ObjectId(storeId), isSubscription: true })
      .populate('user', 'name area')
      .lean()
      .exec();

    const mapped = orders.map((o) => {
      const user = o.user as unknown as { name?: string; area?: string } | null;
      return {
        id: o._id.toString(),
        customerName: user?.name ?? 'Customer',
        customerArea: user?.area ?? '',
        product: o.items[0]?.name ?? 'Subscription',
        frequency: 'Monthly',
        nextOrder: o.nextOrderDate,
        value: o.totalAmount,
        status: o.status === 'cancelled' ? 'paused' : 'active',
      };
    });

    return { data: mapped, message: 'Subscriptions retrieved' };
  }

  async getSubscriptionStats(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const active = await this.orderModel.countDocuments({ store: sid, isSubscription: true, status: { $ne: 'cancelled' } });
    const paused = await this.orderModel.countDocuments({ store: sid, isSubscription: true, status: 'cancelled' });

    return {
      data: {
        activePlans: active,
        activePlansChange: 0,
        activePlansSubtitle: 'vs last month',
        dueThisWeek: 0,
        dueSubtitle: 'auto-renew',
        monthlyRecurring: 'PKR 0',
        recurringChange: 0,
        recurringSubtitle: 'monthly recurring',
        paused,
        pausedSubtitle: 'paused plans',
      },
      message: 'Subscription stats retrieved',
    };
  }

  // ─── Products ───────────────────────────────────────────

  async getProducts(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const products = await this.productModel
      .find({ store: new Types.ObjectId(storeId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const mapped = products.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      category: p.category,
      categoryIcon: getCategoryIcon(p.category),
      iconBgColor: getCategoryBgColor(p.category),
      price: p.price,
      stock: p.stock ?? 0,
      sold: p.sold ?? 0,
      status: p.productStatus ?? (p.inStock ? 'active' : 'outOfStock'),
    }));

    return { data: mapped, message: 'Products retrieved' };
  }

  async getProductStats(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const products = await this.productModel.find({ store: sid }).lean().exec();
    const active = products.filter((p) => (p.productStatus ?? 'active') === 'active').length;
    const lowOut = products.filter((p) => (p.stock ?? 0) <= 5).length;
    const totalSold = products.reduce((sum, p) => sum + (p.sold ?? 0), 0);

    const categoryCounts: Record<string, number> = {};
    for (const p of products) {
      categoryCounts[p.category] = (categoryCounts[p.category] ?? 0) + 1;
    }
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      data: {
        listedProducts: products.length,
        activeCount: active,
        lowOutOfStock: lowOut,
        lowOutSubtitle: 'need restock',
        unitsSold: totalSold,
        unitsSoldChange: 0,
        unitsSoldPeriod: 'this month',
        topCategory: topCategory?.[0] ?? 'N/A',
        topCategoryPercent: products.length > 0 ? `${Math.round(((topCategory?.[1] ?? 0) / products.length) * 100)}%` : '0%',
      },
      message: 'Product stats retrieved',
    };
  }

  async getProduct(storeId: string, productId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const product = await this.productModel
      .findOne({ _id: new Types.ObjectId(productId), store: new Types.ObjectId(storeId) })
      .lean()
      .exec();
    if (!product) throw new NotFoundException('Product not found');

    return {
      data: {
        id: product._id.toString(),
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price,
        stock: product.stock ?? 0,
        sold: product.sold ?? 0,
        status: product.productStatus ?? 'active',
        requiresPrescription: product.requiresPrescription ?? false,
        batchNumber: product.batchNumber,
        expiryDate: product.expiryDate,
        sku: product.sku,
        photo: product.photo,
        inStock: product.inStock,
      },
      message: 'Product retrieved',
    };
  }

  async createProduct(storeId: string, dto: CreateProductDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    await this.productModel.create({
      store: new Types.ObjectId(storeId),
      storeName: store?.storeName ?? '',
      name: dto.productName,
      photo: dto.productPhoto?.name || null,
      description: dto.description,
      category: dto.category.toLowerCase(),
      price: parseInt(dto.price, 10),
      stock: parseInt(dto.stockQuantity, 10),
      inStock: parseInt(dto.stockQuantity, 10) > 0,
      productStatus: 'active',
      requiresPrescription: dto.requiresPrescription,
      batchNumber: dto.batchNumber || null,
      expiryDate: dto.expiryDate || null,
      sku: dto.sku || null,
    });

    return { data: { success: true, message: 'Product added successfully' }, message: 'Product created' };
  }

  async createProductDraft(storeId: string, dto: CreateProductDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    await this.productModel.create({
      store: new Types.ObjectId(storeId),
      storeName: store?.storeName ?? '',
      name: dto.productName,
      photo: dto.productPhoto?.name || null,
      description: dto.description,
      category: dto.category.toLowerCase(),
      price: parseInt(dto.price, 10) || 0,
      stock: parseInt(dto.stockQuantity, 10) || 0,
      inStock: false,
      productStatus: 'draft',
      requiresPrescription: dto.requiresPrescription,
      batchNumber: dto.batchNumber || null,
      expiryDate: dto.expiryDate || null,
      sku: dto.sku || null,
    });

    return { data: { success: true, message: 'Draft saved' }, message: 'Draft saved' };
  }

  async updateProduct(storeId: string, productId: string, dto: UpdateProductDto): Promise<ServiceResponse<null>> {
    const update: Record<string, unknown> = {};
    if (dto.productName !== undefined) update.name = dto.productName;
    if (dto.category !== undefined) update.category = dto.category.toLowerCase();
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.requiresPrescription !== undefined) update.requiresPrescription = dto.requiresPrescription;
    if (dto.batchNumber !== undefined) update.batchNumber = dto.batchNumber || null;
    if (dto.expiryDate !== undefined) update.expiryDate = dto.expiryDate || null;
    if (dto.sku !== undefined) update.sku = dto.sku || null;
    if (dto.status !== undefined) update.productStatus = dto.status;
    if (dto.productPhoto !== undefined) update.photo = dto.productPhoto?.name || null;
    if (dto.price !== undefined) {
      update.price = parseInt(dto.price, 10) || 0;
    }
    if (dto.stockQuantity !== undefined) {
      const stock = parseInt(dto.stockQuantity, 10) || 0;
      update.stock = stock;
      update.inStock = stock > 0;
    }

    const updated = await this.productModel.findOneAndUpdate(
      { _id: new Types.ObjectId(productId), store: new Types.ObjectId(storeId) },
      { $set: update },
    ).exec();
    if (!updated) throw new NotFoundException('Product not found');
    return { data: null, message: 'Product updated' };
  }

  // ─── Bulk Import ────────────────────────────────────────

  async getImportPreview(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    return {
      data: {
        fileName: '',
        fileSize: '0 KB',
        totalRows: 0,
        readyCount: 0,
        needRxCount: 0,
        errorCount: 0,
        previewRows: [],
        remainingRows: 0,
        columnMappings: [],
      },
      message: 'Import preview retrieved',
    };
  }

  async confirmImport(storeId: string): Promise<ServiceResponse<{ success: boolean; imported: number; message: string }>> {
    return { data: { success: true, imported: 0, message: 'No file to import' }, message: 'Import confirmed' };
  }

  async getImportTemplate(): Promise<string> {
    return 'Product Name,Category,Description,Price,Stock Quantity,SKU,Batch Number,Expiry Date,Requires Prescription\n';
  }

  // ─── Payouts ────────────────────────────────────────────

  async getPayouts(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const payouts = await this.payoutModel
      .find({ entityId: new Types.ObjectId(storeId), entityType: 'store' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const mapped = payouts.map((p) => ({
      id: p._id.toString(),
      date: p.date,
      orders: p.orders,
      gross: p.gross,
      commission: p.commission,
      netPaid: p.netPaid,
    }));

    return { data: mapped, message: 'Payouts retrieved' };
  }

  async getPayoutSummary(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const deliveredOrders = await this.orderModel
      .find({ store: sid, status: 'delivered', paymentStatus: 'paid' })
      .lean()
      .exec();

    const available = deliveredOrders.reduce((sum, o) => sum + o.storePayout, 0);
    const heldOrders = await this.orderModel
      .find({ store: sid, status: { $in: ['confirmed', 'packed', 'dispatched'] } })
      .lean()
      .exec();
    const held = heldOrders.reduce((sum, o) => sum + o.storePayout, 0);

    return {
      data: {
        availableToWithdraw: available,
        heldInEscrow: held,
        nextAutoPayout: 'Monday',
      },
      message: 'Payout summary retrieved',
    };
  }

  async getPayoutAccount(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const account = store.merchantAccount ?? '';
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;

    return {
      data: {
        label: store.payoutMethod ?? 'JazzCash',
        initials: getInitials(store.payoutMethod ?? 'JC'),
        maskedNumber: masked,
        accountName: store.ownerName,
        commissionNote: '0% platform commission',
      },
      message: 'Payout account retrieved',
    };
  }

  async withdraw(storeId: string): Promise<ServiceResponse<{ success: boolean }>> {
    return { data: { success: true }, message: 'Withdrawal requested' };
  }

  // ─── Reviews ────────────────────────────────────────────

  async getReviews(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const orders = await this.orderModel
      .find({ store: new Types.ObjectId(storeId) })
      .select('_id')
      .lean()
      .exec();

    const reviews = await this.reviewModel
      .find({ appointment: { $in: orders.map((o) => o._id) } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const mapped = reviews.map((r) => ({
      id: r._id.toString(),
      reviewerName: r.reviewerName ?? 'User',
      reviewerInitial: getInitials(r.reviewerName ?? 'U'),
      reviewerColor: getAvatarColor(r.reviewerName ?? 'U'),
      petName: r.petName ?? r.petType,
      timeAgo: timeAgo(r.createdAt),
      rating: r.rating,
      text: r.comment ?? '',
      reply: r.reply,
    }));

    return { data: mapped, message: 'Reviews retrieved' };
  }

  async getReviewSummary(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const orders = await this.orderModel
      .find({ store: new Types.ObjectId(storeId) })
      .select('_id')
      .lean()
      .exec();

    const reviews = await this.reviewModel
      .find({ appointment: { $in: orders.map((o) => o._id) } })
      .lean()
      .exec();

    const total = reviews.length;
    const avg = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      percent: total > 0 ? Math.round((reviews.filter((r) => r.rating === stars).length / total) * 100) : 0,
    }));

    return {
      data: { averageRating: Math.round(avg * 10) / 10, totalReviews: total, breakdown },
      message: 'Review summary retrieved',
    };
  }

  async replyToReview(reviewId: string, dto: ReplyReviewDto): Promise<ServiceResponse<null>> {
    const review = await this.reviewModel.findByIdAndUpdate(reviewId, { reply: dto.text }).exec();
    if (!review) throw new NotFoundException('Review not found');
    return { data: null, message: 'Reply posted' };
  }

  // ─── Team ──────────────────────────────────────────────

  async getTeam(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const members: Record<string, unknown>[] = [
      {
        id: store._id.toString(),
        name: store.ownerName,
        subtitle: store.phone,
        role: 'ownerAdmin',
        roleLabel: 'Owner / Admin',
        status: 'active',
        isYou: true,
      },
    ];

    const invites = await this.inviteModel
      .find({ entityId: new Types.ObjectId(storeId), entityType: 'store', status: 'pending' })
      .lean()
      .exec();

    for (const inv of invites) {
      members.push({
        id: inv._id.toString(),
        name: inv.inviteeName,
        subtitle: inv.phone,
        role: 'fulfilmentStaff',
        roleLabel: 'Fulfilment Staff',
        status: 'invited',
        isYou: false,
      });
    }

    return { data: members, message: 'Team retrieved' };
  }

  async getTeamStats(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const invites = await this.inviteModel.countDocuments({
      entityId: new Types.ObjectId(storeId),
      entityType: 'store',
      status: 'pending',
    });

    return {
      data: {
        ownersAdmins: 1,
        ownersSubtitle: 'full access',
        fulfilmentStaff: 0,
        staffSubtitle: 'order packing & dispatch',
        pendingInvites: invites,
        pendingSubtitle: 'awaiting response',
      },
      message: 'Team stats retrieved',
    };
  }

  async inviteTeamMember(storeId: string, dto: InviteTeamMemberDto): Promise<ServiceResponse<null>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.inviteModel.create({
      token,
      entityType: 'store',
      entityId: new Types.ObjectId(storeId),
      entityName: store.storeName,
      inviterName: store.ownerName,
      inviteeName: dto.emailOrPhone,
      role: 'fulfilmentStaff',
      phone: dto.emailOrPhone,
      status: 'pending',
      expiresAt,
    });

    return { data: null, message: 'Invite sent' };
  }

  // ─── Settings ──────────────────────────────────────────

  async getSettings(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const account = store.merchantAccount ?? '';
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;

    const maskedPhone = account.length >= 7
      ? account.slice(0, 4) + ' *** ' + account.slice(-4)
      : account;

    return {
      data: {
        profile: {
          storeName: store.storeName,
          phone: store.phone,
          fullAddress: store.storeAddress,
          city: store.city,
          areasServed: store.areasServed,
        },
        delivery: {
          freeDeliveryOver: store.delivery?.freeDeliveryOver ?? '2000',
          deliveryFee: `PKR ${store.delivery?.deliveryFee ?? '150'}`,
          sameDayEnabled: store.delivery?.sameDayEnabled ?? false,
          sameDayCutoff: store.delivery?.sameDayEnabled ? `Orders before ${store.delivery?.sameDayCutoff ?? '14:00'}` : 'Same-day delivery disabled',
        },
        businessHours: {
          openDays: store.businessHours?.openDays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          opens: store.businessHours?.opens ?? '09:00',
          closes: store.businessHours?.closes ?? '21:00',
        },
        payout: {
          label: store.payoutMethod ?? 'JazzCash',
          initials: (store.payoutMethod ?? 'JazzCash').split(/(?=[A-Z])/).map((w: string) => w[0]).join('').toUpperCase(),
          maskedNumber: maskedPhone,
          subtitle: store.ownerName,
          warning: 'Commission: 12% per order, deducted before payout.',
        },
      },
      message: 'Settings retrieved',
    };
  }

  async updateSettings(storeId: string, dto: UpdateStoreSettingsDto): Promise<ServiceResponse<null>> {
    const store = await this.storeModel.findById(storeId).exec();
    if (!store) throw new NotFoundException('Store not found');

    if (dto.profile) {
      store.storeName = dto.profile.storeName;
      store.phone = dto.profile.phone;
      store.storeAddress = dto.profile.fullAddress;
      store.city = dto.profile.city;
      store.areasServed = dto.profile.areasServed;
    }

    if (dto.delivery) {
      const fee = dto.delivery.deliveryFee.replace(/[^0-9]/g, '') || '150';
      store.delivery = {
        freeDeliveryOver: dto.delivery.freeDeliveryOver || store.delivery?.freeDeliveryOver || '2000',
        deliveryFee: fee,
        sameDayEnabled: dto.delivery.sameDayEnabled,
        sameDayCutoff: dto.delivery.sameDayCutoff.replace('Orders before ', ''),
      };
      store.markModified('delivery');
    }

    if (dto.businessHours) {
      store.businessHours = {
        openDays: dto.businessHours.openDays,
        opens: dto.businessHours.opens,
        closes: dto.businessHours.closes,
      };
      store.markModified('businessHours');
    }

    await store.save();

    return { data: null, message: 'Settings updated' };
  }

  // ─── Registration ──────────────────────────────────────

  async register(dto: StoreRegisterDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    const existing = await this.storeModel.findOne({ phone: dto.phone }).lean().exec();
    if (existing) throw new BadRequestException('A store with this phone already exists');

    await this.storeModel.create({
      storeName: dto.storeName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      storeAddress: dto.storeAddress,
      ntn: dto.ntn,
      ownerCnic: dto.ownerCnic,
      businessProof: dto.businessProof?.name ?? null,
      payoutMethod: dto.payoutMethod,
      merchantAccount: dto.merchantAccount,
      status: 'pending',
    });

    return { data: { success: true, message: 'Registration submitted for review' }, message: 'Store registered' };
  }

  // ─── Invite ────────────────────────────────────────────

  async getInviteDetails(token: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const invite = await this.inviteModel.findOne({ token, entityType: 'store', status: 'pending' }).lean().exec();
    if (!invite) throw new NotFoundException('Invite not found or expired');

    return {
      data: {
        storeName: invite.entityName,
        storeInitials: getInitials(invite.entityName),
        inviterName: invite.inviterName,
        inviteeName: invite.inviteeName,
        role: invite.role,
        phone: invite.phone,
      },
      message: 'Invite details retrieved',
    };
  }

  async acceptInvite(token: string, dto: AcceptStoreInviteDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const invite = await this.inviteModel.findOne({ token, entityType: 'store', status: 'pending' }).exec();
    if (!invite) throw new NotFoundException('Invite not found or expired');

    invite.status = 'accepted';
    await invite.save();

    return { data: { success: true, message: 'Invite accepted' }, message: 'Invite accepted' };
  }

  // ─── Missing Endpoints ────────────────────────────────

  async updateSubscriptionStatus(storeId: string, subscriptionId: string, status: string): Promise<ServiceResponse<null>> {
    const order = await this.orderModel.findOneAndUpdate(
      { _id: new Types.ObjectId(subscriptionId), store: new Types.ObjectId(storeId), isSubscription: true },
      { status: status === 'paused' || status === 'cancelled' ? 'cancelled' : 'confirmed' },
    ).exec();
    if (!order) throw new NotFoundException('Subscription not found');
    return { data: null, message: `Subscription ${status}` };
  }

  async updateProductStatus(storeId: string, productId: string, status: string): Promise<ServiceResponse<null>> {
    const product = await this.productModel.findOneAndUpdate(
      { _id: new Types.ObjectId(productId), store: new Types.ObjectId(storeId) },
      { productStatus: status, inStock: status === 'active' },
    ).exec();
    if (!product) throw new NotFoundException('Product not found');
    return { data: null, message: `Product ${status}` };
  }

  async getProductCategories(): Promise<ServiceResponse<string[]>> {
    return { data: ['Food', 'Medicine', 'Accessories', 'Treats', 'Grooming'], message: 'Categories retrieved' };
  }

  async updateTeamMemberStatus(storeId: string, memberId: string, status: string): Promise<ServiceResponse<null>> {
    if (status === 'revoked') {
      await this.inviteModel.findOneAndUpdate(
        { _id: new Types.ObjectId(memberId), entityId: new Types.ObjectId(storeId), entityType: 'store' },
        { status: 'expired' },
      ).exec();
    }
    return { data: null, message: `Member ${status}` };
  }

  async updatePayoutAccount(storeId: string, accountNumber: string): Promise<ServiceResponse<null>> {
    await this.storeModel.findByIdAndUpdate(storeId, { merchantAccount: accountNumber }).exec();
    return { data: null, message: 'Payout account submitted for verification' };
  }
}
