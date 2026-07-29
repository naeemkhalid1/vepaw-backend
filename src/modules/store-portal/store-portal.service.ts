import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import { Order, OrderDocument } from '../../database/schemas/order.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { Review, ReviewDocument } from '../../database/schemas/review.schema';
import { Payout, PayoutDocument } from '../../database/schemas/payout.schema';
import { Invite, InviteDocument } from '../../database/schemas/invite.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';
import {
  PayoutAccountAudit,
  PayoutAccountAuditDocument,
} from '../../database/schemas/payout-account-audit.schema';
import { ServiceResponse } from '../../shared/types';
import { S3Service } from '../../common/storage/s3.service';
import { BrevoEmailService } from '../../common/email/brevo-email.service';
import { payoutMethodLabel, payoutAccountValue, maskPayoutValue } from '../../shared/utils/payout-account.util';
import {
  detectColumnMappings,
  validateRows,
  formatFileSize,
  ColumnMapping,
  ImportField,
  ImportRowRecord,
} from '../../shared/utils/product-import.util';
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

// Keeps a single pending import's parsed rows comfortably inside Mongo's 16MB document limit —
// a store catalog this large should be split into batches anyway.
const MAX_IMPORT_ROWS = 1000;
const IMPORT_PREVIEW_SAMPLE_SIZE = 20;

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
    @InjectModel(PayoutAccountAudit.name)
    private readonly payoutAccountAuditModel: Model<PayoutAccountAuditDocument>,
    private readonly s3Service: S3Service,
    private readonly emailService: BrevoEmailService,
  ) {}

  // ─── Orders ──────────────────────────────────────────────

  // A safepay order sitting at paymentStatus:'pending' hasn't actually been paid for yet — same
  // gate established marketplaces (Shopify, Daraz, Amazon Seller Central) apply before a seller
  // ever sees or acts on an order. cod orders have no such wait, since there's no advance
  // payment to confirm.
  private readonly payableFilter: Record<string, unknown> = {
    $or: [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }],
  };

  async getOrders(storeId: string, from?: string, to?: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const createdAt: Record<string, Date> = {};
    if (from) {
      const start = new Date(from);
      if (isNaN(start.getTime())) throw new BadRequestException('Invalid "from" date');
      createdAt.$gte = start;
    }
    if (to) {
      const end = new Date(to);
      if (isNaN(end.getTime())) throw new BadRequestException('Invalid "to" date');
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }

    const orders = await this.orderModel
      .find({
        store: new Types.ObjectId(storeId),
        status: { $ne: 'cancelled' },
        ...this.payableFilter,
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
      })
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
        createdAt: o.createdAt,
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
      this.orderModel.countDocuments({ store: sid, status: 'confirmed', ...this.payableFilter }),
      this.orderModel.countDocuments({ store: sid, status: 'dispatched', updatedAt: { $gte: startOfDay } }),
      this.orderModel.find({ store: sid, createdAt: { $gte: startOfMonth }, ...this.payableFilter }).lean().exec(),
    ]);

    const oldest = await this.orderModel
      .findOne({ store: sid, status: 'confirmed', ...this.payableFilter })
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
    const existing = await this.orderModel
      .findOne({ _id: new Types.ObjectId(orderId), store: new Types.ObjectId(storeId) })
      .lean()
      .exec();
    if (!existing) throw new NotFoundException('Order not found');

    // Mirrors the read-side payableFilter — a store can't act on an order until Safepay
    // payment is actually confirmed, same gate established marketplaces apply.
    if (existing.paymentMethod === 'safepay' && existing.paymentStatus !== 'paid') {
      throw new BadRequestException({
        message: 'Cannot update order status until payment is confirmed',
        code: 'PAYMENT_NOT_CONFIRMED',
      });
    }

    const order = await this.orderModel.findOneAndUpdate(
      { _id: new Types.ObjectId(orderId), store: new Types.ObjectId(storeId) },
      { status },
    ).exec();
    if (!order) throw new NotFoundException('Order not found');

    // existing.status !== 'cancelled' guards against a repeat cancel call double-restoring —
    // there's no TERMINAL_STATUSES-style guard on this endpoint blocking that the way the
    // customer-facing StoreService.updateOrderStatus() has.
    if (status === 'cancelled' && existing.status !== 'cancelled') {
      await this.restoreStock(existing.items);
    }

    return { data: null, message: `Order ${status}` };
  }

  // Mirrors StoreService.restoreStock() — returns reserved stock to a product on order
  // cancellation initiated from the store-portal side.
  private async restoreStock(
    items: { product: Types.ObjectId; qty: number }[],
  ): Promise<void> {
    for (const item of items) {
      await this.productModel
        .updateOne(
          { _id: item.product },
          { $inc: { stock: item.qty }, $set: { inStock: true } },
        )
        .exec();
    }
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
        status: o.status === 'cancelled' || o.status === 'paused' ? 'paused' : 'active',
      };
    });

    return { data: mapped, message: 'Subscriptions retrieved' };
  }

  async getSubscriptionStats(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const active = await this.orderModel.countDocuments({ store: sid, isSubscription: true, status: { $nin: ['cancelled', 'paused'] } });
    const paused = await this.orderModel.countDocuments({ store: sid, isSubscription: true, status: { $in: ['cancelled', 'paused'] } });

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
      photo: p.photo ?? null,
      description: p.description,
      price: p.price,
      stock: p.stock ?? 0,
      sold: p.sold ?? 0,
      sku: p.sku ?? null,
      requiresPrescription: p.requiresPrescription ?? false,
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
        variants: (product.variants ?? []).map((v) => ({
          id: (v as unknown as Record<string, unknown>)._id?.toString() ?? '',
          label: v.label,
          price: v.price,
          originalPrice: v.originalPrice,
          inStock: v.inStock,
        })),
      },
      message: 'Product retrieved',
    };
  }

  // Returned `name` is what createProduct/updateProduct/createProductDraft already read as
  // productPhoto.name and persist verbatim as Product.photo — matches the vet-onboarding upload
  // contract (upload first, then reference the returned name in the create/update body).
  async uploadProductPhoto(photo: Express.Multer.File): Promise<ServiceResponse<{ name: string; status: string }>> {
    const url = await this.s3Service.uploadImage(photo, 'uploads');
    return { data: { name: url, status: 'uploaded' }, message: 'Photo uploaded' };
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
      variants: dto.variants ?? [],
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
      variants: dto.variants ?? [],
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
    if (dto.variants !== undefined) update.variants = dto.variants;

    const updated = await this.productModel.findOneAndUpdate(
      { _id: new Types.ObjectId(productId), store: new Types.ObjectId(storeId) },
      { $set: update },
    ).exec();
    if (!updated) throw new NotFoundException('Product not found');
    return { data: null, message: 'Product updated' };
  }

  // ─── Bulk Import ────────────────────────────────────────
  // Upload → Map → Review, backed by Store.pendingImport (one in-flight import per store) rather
  // than Redis/a session store — the raw file lives in S3 as the durable/audit copy, and the
  // parsed rows + column mapping live directly on the Store doc so Map/Review steps work purely
  // against Mongo without re-fetching or re-parsing the file each time.

  async uploadImportFile(storeId: string, file: Express.Multer.File): Promise<ServiceResponse<Record<string, unknown>>> {
    const parsed = parseCsv(file.buffer, { skip_empty_lines: true, trim: true }) as string[][];
    if (parsed.length === 0) throw new BadRequestException('CSV file is empty');

    const [headerRow, ...dataRows] = parsed;
    if (dataRows.length === 0) throw new BadRequestException('CSV file has no data rows');
    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`CSV has ${dataRows.length} rows — split it into batches of ${MAX_IMPORT_ROWS} or fewer`);
    }

    const s3Key = await this.s3Service.uploadPrivateImage(file, 'store-imports');
    const columnMappings = detectColumnMappings(headerRow);
    // rowNumber is 1-indexed against the file itself (header = row 1) so it matches what the
    // store owner sees if they open the CSV in a spreadsheet — not a 0-indexed array position.
    const rows: ImportRowRecord[] = dataRows.map((values, i) => ({ rowNumber: i + 2, values }));

    const pendingImport = {
      s3Key,
      fileName: file.originalname,
      fileSize: file.size,
      headers: headerRow,
      rows,
      columnMappings,
      uploadedAt: new Date(),
    };
    await this.storeModel.findByIdAndUpdate(storeId, { pendingImport }).exec();

    return { data: this.buildImportPreviewResponse(pendingImport), message: 'File uploaded' };
  }

  async getImportPreview(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(storeId).select('pendingImport').lean().exec();
    return { data: this.buildImportPreviewResponse(store?.pendingImport ?? null), message: 'Import preview retrieved' };
  }

  async updateImportMapping(
    storeId: string,
    columnMappings: { columnIndex: number; mappedField?: ImportField | null }[],
  ): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(storeId).select('pendingImport').exec();
    if (!store?.pendingImport) throw new NotFoundException('No pending import — upload a file first');

    const mappedFields = columnMappings.map((m) => m.mappedField).filter((f): f is ImportField => f !== null);
    if (new Set(mappedFields).size !== mappedFields.length) {
      throw new BadRequestException('Each column can only be mapped to one field at a time');
    }

    const byIndex = new Map(columnMappings.map((m) => [m.columnIndex, m.mappedField]));
    store.pendingImport.columnMappings = store.pendingImport.columnMappings.map((existing) => ({
      ...existing,
      mappedField: byIndex.has(existing.columnIndex) ? (byIndex.get(existing.columnIndex) ?? null) : existing.mappedField,
    }));
    store.markModified('pendingImport');
    await store.save();

    return { data: this.buildImportPreviewResponse(store.pendingImport), message: 'Column mapping updated' };
  }

  async confirmImport(storeId: string): Promise<ServiceResponse<{ success: boolean; imported: number; skipped: number; errors: { row: number; reasons: string[] }[]; message: string }>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store?.pendingImport) {
      return { data: { success: false, imported: 0, skipped: 0, errors: [], message: 'No file to import' }, message: 'Import confirmed' };
    }

    const validated = validateRows(store.pendingImport.rows, store.pendingImport.columnMappings as ColumnMapping[]);
    const validRows = validated.filter((r) => r.errors.length === 0);
    const invalidRows = validated.filter((r) => r.errors.length > 0);

    if (validRows.length > 0) {
      await this.productModel.insertMany(
        validRows.map((r) => ({
          store: new Types.ObjectId(storeId),
          storeName: store.storeName,
          name: r.mapped.productName!,
          // CSV rows carry no photo column — imported products start with no photo, same as any
          // product created without one; the store can add one afterwards via upload-photo.
          photo: null,
          description: r.mapped.description!,
          category: (r.mapped.category ?? '').toLowerCase(),
          price: Number(r.mapped.price),
          stock: Number(r.mapped.stockQuantity),
          inStock: Number(r.mapped.stockQuantity) > 0,
          productStatus: 'active',
          requiresPrescription: r.requiresPrescription ?? false,
          batchNumber: r.mapped.batchNumber || null,
          expiryDate: r.mapped.expiryDate || null,
          sku: r.mapped.sku || null,
          variants: [],
        })),
      );
    }

    await this.storeModel.findByIdAndUpdate(storeId, { pendingImport: null }).exec();

    return {
      data: {
        success: true,
        imported: validRows.length,
        skipped: invalidRows.length,
        errors: invalidRows.map((r) => ({ row: r.rowNumber, reasons: r.errors })),
        message: `Imported ${validRows.length} product${validRows.length === 1 ? '' : 's'}${invalidRows.length ? `, skipped ${invalidRows.length}` : ''}`,
      },
      message: 'Import confirmed',
    };
  }

  private buildImportPreviewResponse(
    pendingImport: {
      fileName: string;
      fileSize: number;
      rows: ImportRowRecord[];
      columnMappings: ColumnMapping[];
    } | null,
  ): Record<string, unknown> {
    if (!pendingImport) {
      return {
        fileName: '',
        fileSize: '0 KB',
        totalRows: 0,
        readyCount: 0,
        needRxCount: 0,
        errorCount: 0,
        previewRows: [],
        remainingRows: 0,
        columnMappings: [],
      };
    }

    const validated = validateRows(pendingImport.rows, pendingImport.columnMappings);
    const readyCount = validated.filter((r) => r.errors.length === 0 && r.requiresPrescription === false).length;
    const needRxCount = validated.filter((r) => r.errors.length === 0 && r.requiresPrescription === true).length;
    const errorCount = validated.filter((r) => r.errors.length > 0).length;
    const previewRows = validated.slice(0, IMPORT_PREVIEW_SAMPLE_SIZE).map((r) => ({
      row: r.rowNumber,
      productName: r.mapped.productName ?? '',
      category: r.mapped.category ?? '',
      price: r.mapped.price ?? '',
      stockQuantity: r.mapped.stockQuantity ?? '',
      requiresPrescription: r.requiresPrescription,
      errors: r.errors,
    }));

    return {
      fileName: pendingImport.fileName,
      fileSize: formatFileSize(pendingImport.fileSize),
      totalRows: validated.length,
      readyCount,
      needRxCount,
      errorCount,
      previewRows,
      remainingRows: Math.max(0, validated.length - previewRows.length),
      columnMappings: pendingImport.columnMappings.map((m) => ({ columnIndex: m.columnIndex, csvColumn: m.csvColumn, mappedField: m.mappedField })),
    };
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
      status: p.status,
    }));

    return { data: mapped, message: 'Payouts retrieved' };
  }

  async getPayoutSummary(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const sid = new Types.ObjectId(storeId);
    const deliveredOrders = await this.orderModel
      .find({ store: sid, status: 'delivered', paymentStatus: 'paid', payoutId: null })
      .lean()
      .exec();

    const available = deliveredOrders.reduce((sum, o) => sum + o.storePayout, 0);
    const heldOrders = await this.orderModel
      .find({ store: sid, status: { $in: ['confirmed', 'packed', 'dispatched'] }, ...this.payableFilter })
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

    const account = payoutAccountValue(store);
    const masked = account.length > 4 ? '•••• ' + account.slice(-4) : account;
    const label = payoutMethodLabel(store.payoutMethod, store.bankName);

    return {
      data: {
        label,
        initials: getInitials(label),
        maskedNumber: masked,
        accountName: store.accountTitle ?? store.ownerName,
        commissionNote: 'Platform commission applied',
      },
      message: 'Payout account retrieved',
    };
  }

  // Shared by the store-initiated withdraw endpoint and the weekly auto-batch cron below.
  // Stores are single-entity (no multi-staff clinic-style structure like vets), so this is
  // simpler than batchPayoutForVet — no cross-staff aggregation needed, just this store's own
  // unsettled orders. Only delivered+paid orders count toward this batch — payoutId is the
  // guard against paying the same order out twice. Returns null when there's nothing to batch.
  private async batchPayoutForStore(
    storeId: Types.ObjectId,
    store: Pick<Store, 'payoutMethod' | 'bankName'>,
    requestedBy: Types.ObjectId | null,
  ): Promise<{ payoutId: Types.ObjectId; amount: number } | null> {
    const unsettled = await this.orderModel
      .find({ store: storeId, status: 'delivered', paymentStatus: 'paid', payoutId: null })
      .exec();

    const amount = unsettled.reduce((s, o) => s + o.storePayout, 0);
    if (unsettled.length === 0 || amount <= 0) return null;

    const gross = unsettled.reduce((s, o) => s + o.totalAmount, 0);
    const commission = unsettled.reduce((s, o) => s + o.platformCommission, 0);

    const payout = await this.payoutModel.create({
      entityId: storeId,
      entityType: 'store',
      label: `Payout — ${unsettled.length} order${unsettled.length === 1 ? '' : 's'}`,
      date: new Date().toISOString().slice(0, 10),
      method: payoutMethodLabel(store.payoutMethod, store.bankName),
      orders: unsettled.length,
      gross,
      commission,
      netPaid: amount,
      amount,
      status: 'pending',
      requestedBy,
    });

    await this.orderModel
      .updateMany({ _id: { $in: unsettled.map((o) => o._id) } }, { $set: { payoutId: payout._id } })
      .exec();

    return { payoutId: payout._id, amount };
  }

  async withdraw(storeId: string): Promise<ServiceResponse<{ payoutId: string; amount: number }>> {
    const sid = new Types.ObjectId(storeId);
    const store = await this.storeModel.findById(sid).lean().exec();
    if (!store) throw new NotFoundException('Store not found');
    if (!store.payoutMethod) {
      throw new BadRequestException({
        message: 'Set up a payout account before requesting a withdrawal',
        code: 'PAYOUT_ACCOUNT_NOT_SET',
      });
    }

    const result = await this.batchPayoutForStore(sid, store, sid);
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

  // Runs every Monday at 00:00 Asia/Karachi, same window as the vet auto-batch cron.
  @Cron('0 0 * * 1', { timeZone: 'Asia/Karachi' })
  async autoBatchWeeklyStorePayouts(): Promise<void> {
    const storeIdsWithBalance = await this.orderModel.distinct('store', {
      status: 'delivered',
      paymentStatus: 'paid',
      payoutId: null,
    });

    let batched = 0;
    for (const storeId of storeIdsWithBalance as Types.ObjectId[]) {
      const store = await this.storeModel.findById(storeId).select('payoutMethod bankName').lean().exec();
      if (!store?.payoutMethod) continue; // no payout account set up yet — skip until they add one

      const result = await this.batchPayoutForStore(storeId, store, null);
      if (result) batched++;
    }

    if (batched > 0) {
      this.logger.log(`Weekly auto-batch: created ${batched} store payout(s)`);
    }
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

    // Invite.email was never being set here despite the schema/DTO supporting it (dto is named
    // emailOrPhone) — meant this invite could never actually be emailed even before the send call
    // below existed.
    const isEmail = dto.emailOrPhone.includes('@');
    const inviteEmail = isEmail ? dto.emailOrPhone : null;
    const invitePhone = isEmail ? null : dto.emailOrPhone;

    await this.inviteModel.create({
      token,
      entityType: 'store',
      entityId: new Types.ObjectId(storeId),
      entityName: store.storeName,
      inviterName: store.ownerName,
      inviteeName: dto.emailOrPhone,
      role: 'fulfilmentStaff',
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
        store.ownerName,
        store.storeName,
        'fulfilmentStaff',
        token,
        'store',
      );
    }

    return { data: null, message: 'Invite sent' };
  }

  // ─── Settings ──────────────────────────────────────────

  async getSettings(storeId: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const store = await this.storeModel.findById(storeId).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const masked = maskPayoutValue(store);
    const label = payoutMethodLabel(store.payoutMethod, store.bankName);

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
          method: store.payoutMethod,
          label,
          initials: getInitials(label),
          bankName: store.bankName ?? null,
          maskedNumber: masked,
          subtitle: store.accountTitle ?? store.ownerName,
          warning: 'Commission: 10% per order, deducted before payout.',
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

  // Public (pre-auth, same as vet onboarding's upload) — call before register, pass the
  // returned name as businessProof. Public 'uploads' prefix: not government ID like a vet's
  // CNIC, so no private-storage handling needed.
  async uploadRegistrationDocument(file: Express.Multer.File): Promise<ServiceResponse<{ name: string; status: string }>> {
    const url = await this.s3Service.uploadImage(file, 'uploads');
    return { data: { name: url, status: 'uploaded' }, message: 'Document uploaded' };
  }

  async register(dto: StoreRegisterDto): Promise<ServiceResponse<{ success: boolean; message: string }>> {
    const existing = await this.storeModel.findOne({ phone: dto.phone }).lean().exec();
    if (existing) throw new BadRequestException('A store with this phone already exists');

    const isBank = dto.payoutMethod === 'bank_transfer';
    await this.storeModel.create({
      storeName: dto.storeName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      storeAddress: dto.storeAddress,
      ntn: dto.ntn,
      ownerCnic: dto.ownerCnic,
      businessProof: dto.businessProof?.name ?? null,
      payoutMethod: dto.payoutMethod,
      accountTitle: dto.accountTitle ?? dto.ownerName,
      walletNumber: isBank ? null : (dto.walletNumber ?? null),
      bankName: isBank ? (dto.bankName ?? null) : null,
      accountNumber: isBank ? (dto.accountNumber ?? null) : null,
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
        phone: invite.phone ?? '',
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

  async updatePayoutAccount(storeId: string, dto: UpdatePayoutAccountDto): Promise<ServiceResponse<null>> {
    const sid = new Types.ObjectId(storeId);
    const previous = await this.storeModel.findById(sid).lean().exec();
    if (!previous) throw new NotFoundException('Store not found');

    const isBank = dto.method === 'bank_transfer';
    const nextValues = {
      payoutMethod: dto.method,
      accountTitle: dto.accountTitle,
      walletNumber: isBank ? null : (dto.walletNumber ?? null),
      bankName: isBank ? (dto.bankName ?? null) : null,
      accountNumber: isBank ? (dto.accountNumber ?? null) : null,
    };
    await this.storeModel.findByIdAndUpdate(sid, nextValues).exec();

    // One immutable audit entry per change — who, from what, to what. Shared schema with
    // vet-portal's payout-account trail (entityType distinguishes which).
    await this.payoutAccountAuditModel.create({
      entityId: sid,
      entityType: 'store',
      changedBy: sid,
      changedByName: previous.ownerName,
      changedByRole: null,
      previousValues: {
        payoutMethod: previous.payoutMethod,
        accountTitle: previous.accountTitle,
        walletNumber: previous.walletNumber,
        bankName: previous.bankName,
        accountNumber: previous.accountNumber,
      },
      newValues: nextValues,
    });

    return { data: null, message: 'Payout account submitted for verification' };
  }

  async getPayoutAccountHistory(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const entries = await this.payoutAccountAuditModel
      .find({ entityId: new Types.ObjectId(storeId), entityType: 'store' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      data: entries.map((e) => ({
        id: e._id.toString(),
        changedByName: e.changedByName,
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
  // one chronological feed, same pattern as the vet-portal equivalent. Stores are single-entity
  // (no staff to resolve), so "actor" is always just the store's own owner name when set.
  async getPayoutActivity(storeId: string): Promise<ServiceResponse<Record<string, unknown>[]>> {
    const sid = new Types.ObjectId(storeId);
    const store = await this.storeModel.findById(sid).lean().exec();
    if (!store) throw new NotFoundException('Store not found');

    const [accountChanges, payouts] = await Promise.all([
      this.payoutAccountAuditModel.find({ entityId: sid, entityType: 'store' }).lean().exec(),
      this.payoutModel.find({ entityId: sid, entityType: 'store' }).lean().exec(),
    ]);

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
        summary: `Payout requested — PKR ${p.amount.toLocaleString()} (${p.orders} order${p.orders === 1 ? '' : 's'})`,
        actor: p.requestedBy ? store.ownerName : 'Weekly auto-batch',
        occurredAt: p.createdAt,
      });

      if (p.status === 'completed' && p.settledAt) {
        events.push({
          id: `${p._id.toString()}-settled`,
          type: 'payout_settled',
          summary: `Payout settled — PKR ${p.amount.toLocaleString()}${p.transactionReference ? ` (ref: ${p.transactionReference})` : ''}`,
          actor: null, // settled by an admin, not the store — resolved via admin.service.ts's own getPayouts if needed
          occurredAt: p.settledAt,
        });
      }
    }

    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return { data: events, message: 'Payout activity retrieved' };
  }
}
