import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { createHash, createHmac, randomInt } from 'crypto';
import { Appointment, AppointmentDocument } from '../../database/schemas/appointment.schema';
import { ServiceResponse } from '../../shared/types';
import { JazzCashInitiateDto } from './dto/jazzcash-initiate.dto';
import { EasypaisaInitiateDto } from './dto/easypaisa-initiate.dto';

const JAZZCASH_CHECKOUT_SANDBOX =
  'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
const JAZZCASH_CHECKOUT_PROD =
  'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
const EASYPAISA_CHECKOUT = 'https://easypay.easypaisa.com.pk/easypay/';
const PAYMENT_EXPIRY_MINUTES = 30;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly config: ConfigService,
  ) {}

  async initiateJazzCash(
    userId: string,
    dto: JazzCashInitiateDto,
  ): Promise<ServiceResponse<{ paymentUrl: string; txnRefNo: string }>> {
    const appointment = await this.findOwnedPendingAppointment(userId, dto.appointmentId);

    const merchantId = this.config.getOrThrow<string>('JAZZCASH_MERCHANT_ID');
    const password = this.config.getOrThrow<string>('JAZZCASH_PASSWORD');
    const integritySalt = this.config.getOrThrow<string>('JAZZCASH_INTEGRITY_SALT');
    const returnUrl = this.config.get<string>(
      'JAZZCASH_RETURN_URL',
      'https://api.vepaw.pk/api/v1/payments/jazzcash/callback',
    );

    const now = new Date();
    const txnDateTime = this.formatDateTime(now);
    const txnExpiryDateTime = this.formatDateTime(
      new Date(now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
    );
    const txnRefNo = `T${txnDateTime}${String(randomInt(1000, 9999))}`;

    // JazzCash amount is in paisas (PKR × 100)
    const amountPaisas = String(appointment.fee * 100);

    const params: Record<string, string> = {
      pp_Amount: amountPaisas,
      pp_BillReference: appointment._id.toString(),
      pp_Description: `VePaw - ${appointment.petDetails.name} appointment`,
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_ReturnURL: returnUrl,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_TxnExpiryDateTime: txnExpiryDateTime,
      pp_TxnRefNo: txnRefNo,
      pp_TxnType: 'MWALLET',
      pp_Version: '1.1',
      ppmpf_1: appointment._id.toString(), // appointmentId for callback lookup
    };

    params.pp_SecureHash = this.computeJazzCashHash(params, integritySalt);

    await this.appointmentModel.updateOne(
      { _id: appointment._id },
      { $set: { paymentReference: txnRefNo } },
    );

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const baseUrl = isProduction ? JAZZCASH_CHECKOUT_PROD : JAZZCASH_CHECKOUT_SANDBOX;
    const paymentUrl = `${baseUrl}?${new URLSearchParams(params).toString()}`;

    return { data: { paymentUrl, txnRefNo }, message: 'JazzCash payment initiated' };
  }

  async initiateEasypaisa(
    userId: string,
    dto: EasypaisaInitiateDto,
  ): Promise<ServiceResponse<{ paymentUrl: string; transactionId: string }>> {
    const appointment = await this.findOwnedPendingAppointment(userId, dto.appointmentId);

    const storeId = this.config.getOrThrow<string>('EASYPAISA_STORE_ID');
    const apiKey = this.config.getOrThrow<string>('EASYPAISA_API_KEY');
    const postBackUrl = this.config.get<string>(
      'EASYPAISA_RETURN_URL',
      'https://api.vepaw.pk/api/v1/payments/easypaisa/callback',
    );

    const now = new Date();
    const orderId = appointment._id.toString();
    const transactionId = `EP${this.formatDateTime(now)}${String(randomInt(1000, 9999))}`;
    const tokenExpiry = this.formatDateTime(
      new Date(now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
    );
    const amount = appointment.fee.toFixed(2);
    const transactionType = 'MA'; // mobile account

    // EasyPaisa storeHashRequest: MD5 of concatenated fields (no separator)
    const hashInput = [
      apiKey,
      storeId,
      orderId,
      amount,
      dto.phone,
      '', // emailAddress
      transactionType,
      tokenExpiry,
      '', // bankIdentificationNumber
      '', // reservedField2
      '', // reservedField3
    ].join('');
    const storeHashRequest = createHash('md5').update(hashInput).digest('hex');

    const params = new URLSearchParams({
      storeId,
      amount,
      postBackURL: postBackUrl,
      orderRefNum: orderId,
      mobileNum: dto.phone,
      emailAddress: '',
      transactionType,
      tokenExpiry,
      bankIdentificationNumber: '',
      reservedField2: '',
      reservedField3: '',
      storeHashRequest,
    });

    await this.appointmentModel.updateOne(
      { _id: appointment._id },
      { $set: { paymentReference: transactionId } },
    );

    const paymentUrl = `${EASYPAISA_CHECKOUT}?${params.toString()}`;
    return { data: { paymentUrl, transactionId }, message: 'EasyPaisa payment initiated' };
  }

  async handleJazzCashCallback(
    body: Record<string, string>,
  ): Promise<ServiceResponse<null>> {
    const { pp_SecureHash, ...fields } = body;

    if (!pp_SecureHash) {
      this.logger.warn('JazzCash callback: missing SecureHash');
      return { data: null, message: 'Invalid callback' };
    }

    const integritySalt = this.config.get<string>('JAZZCASH_INTEGRITY_SALT', '');
    const computed = this.computeJazzCashHash(fields, integritySalt);

    if (computed !== pp_SecureHash.toUpperCase()) {
      this.logger.warn('JazzCash callback: HMAC mismatch — possible spoofed request');
      return { data: null, message: 'Invalid signature' };
    }

    // ppmpf_1 carries the appointmentId set during initiation
    const appointmentId = fields.ppmpf_1 ?? fields.pp_BillReference;
    if (!appointmentId || !Types.ObjectId.isValid(appointmentId)) {
      this.logger.warn(`JazzCash callback: invalid appointmentId "${appointmentId}"`);
      return { data: null, message: 'Unknown reference' };
    }

    const isSuccess = fields.pp_ResponseCode === '000';

    if (isSuccess) {
      await this.appointmentModel.updateOne(
        { _id: appointmentId, paymentStatus: 'pending' },
        { $set: { paymentStatus: 'held', status: 'confirmed' } },
      );
      this.logger.log(`JazzCash: payment held for appointment ${appointmentId}`);
    } else {
      await this.appointmentModel.updateOne(
        { _id: appointmentId },
        { $set: { status: 'cancelled', paymentStatus: 'refunded' } },
      );
      this.logger.warn(
        `JazzCash: payment failed for ${appointmentId} — code ${fields.pp_ResponseCode}`,
      );
    }

    // TODO: dispatch FCM push via NotificationsService once that module is built

    return { data: null, message: 'Callback processed' };
  }

  private async findOwnedPendingAppointment(
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
      throw new ForbiddenException({ message: 'Not authorized', code: 'FORBIDDEN' });
    }

    if (appointment.paymentStatus !== 'pending') {
      throw new BadRequestException({
        message: 'Payment already initiated or completed for this appointment',
        code: 'PAYMENT_ALREADY_PROCESSED',
      });
    }

    return appointment;
  }

  private computeJazzCashHash(params: Record<string, string>, salt: string): string {
    const sortedValues = Object.keys(params)
      .sort()
      .map((k) => params[k]);
    const message = [salt, ...sortedValues].join('&');
    return createHmac('sha256', salt).update(message).digest('hex').toUpperCase();
  }

  private formatDateTime(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      String(date.getFullYear()) +
      p(date.getMonth() + 1) +
      p(date.getDate()) +
      p(date.getHours()) +
      p(date.getMinutes()) +
      p(date.getSeconds())
    );
  }
}
