import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Safepay from '@sfpy/node-core';

export interface SafepayCheckoutSession {
  trackerToken: string;
  checkoutUrl: string;
}

const CURRENCY = 'PKR';

// The SDK's response types are untyped (Promise<any>) — narrow to a plain string at the
// boundary instead of letting `any` propagate into the rest of the service.
function extractString(value: unknown, ...path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

@Injectable()
export class SafepayService {
  private readonly logger = new Logger(SafepayService.name);
  private readonly client: Safepay;
  private readonly environment: 'development' | 'sandbox' | 'production';
  private readonly publicKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.environment = this.config.getOrThrow<
      'development' | 'sandbox' | 'production'
    >('SAFEPAY_ENVIRONMENT');
    this.publicKey = this.config.getOrThrow<string>('SAFEPAY_PUBLIC_KEY');
    this.webhookSecret = this.config.getOrThrow<string>(
      'SAFEPAY_WEBHOOK_SECRET',
    );
    const secretKey = this.config.getOrThrow<string>('SAFEPAY_SECRET_KEY');

    const host =
      this.environment === 'production'
        ? 'https://api.getsafepay.com'
        : 'https://sandbox.api.getsafepay.com';

    this.client = new Safepay(secretKey, { authType: 'secret', host });
  }

  // Express Checkout: two server-side calls (session setup + passport token) followed by a
  // client-side URL build — no raw card data ever touches our server, Safepay hosts the form.
  async createCheckoutSession(
    amountPKR: number,
    orderId: string,
    redirectUrl: string,
    cancelUrl: string,
  ): Promise<SafepayCheckoutSession> {
    // Safepay's API expects amount in the smallest currency subunit (paisas), not whole
    // rupees — every caller in this codebase deals in whole PKR, so convert only at this
    // boundary or a 750 PKR fee gets charged as PKR 7.50.
    const session: unknown = await this.client.payments.session.setup({
      merchant_api_key: this.publicKey,
      //   intent: 'CYBERSOURCE',
      mode: 'payment',
      currency: CURRENCY,
      amount: Math.round(amountPKR * 100),
      metadata: { order_id: orderId },
    });

    const trackerToken =
      extractString(session, 'data', 'tracker', 'token') ??
      extractString(session, 'data', 'token');
    if (!trackerToken) {
      this.logger.error(
        `Safepay session.setup returned no tracker token: ${JSON.stringify(session)}`,
      );
      throw new Error('Safepay did not return a tracker token');
    }

    const passport: unknown = await this.client.client.passport.create({
      tracker: trackerToken,
    });
    const tbt =
      extractString(passport, 'data', 'token') ??
      extractString(passport, 'data') ??
      extractString(passport, 'token');
    if (!tbt) {
      this.logger.error(
        `Safepay passport.create returned no token: ${JSON.stringify(passport)}`,
      );
      throw new Error('Safepay did not return a passport token');
    }

    const checkoutUrl = this.client.checkout.createCheckoutUrl({
      env: this.environment,
      tbt,
      tracker: trackerToken,
      source: 'hosted',
      order_id: orderId,
      redirect_url: redirectUrl,
      cancel_url: cancelUrl,
    });

    return { trackerToken, checkoutUrl };
  }

  // Full refund of a completed payment, keyed by the same tracker token stored as
  // paymentReference on the domain record (Order/Appointment/ConsultationSession). Confirmed
  // live against sandbox: Safepay's refund endpoint rejects the request outright ("amount:
  // cannot be blank; currency: cannot be blank") unless both are supplied explicitly — there is
  // no implicit "omit for full refund" — so amountPKR is required and converted to paisas here,
  // same convention as createCheckoutSession.
  async refundPayment(trackerToken: string, amountPKR: number): Promise<void> {
    try {
      await this.client.order.cancel.refund(trackerToken, {
        amount: Math.round(amountPKR * 100),
        currency: CURRENCY,
      });
    } catch (err) {
      this.logger.error(
        `Safepay refund failed for tracker ${trackerToken}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  // Safepay signs the exact raw request bytes (SHA-512 HMAC) — must be checked against the
  // untouched body, before any JSON re-serialization, or the signature will never match.
  verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): boolean {
    if (!signatureHeader) return false;

    const expected = createHmac('sha512', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signatureHeader, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;

    return timingSafeEqual(expectedBuf, receivedBuf);
  }
}
