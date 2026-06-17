import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendOtp(phone: string, otp: string): Promise<void> {
    // TODO: replace with real SMS provider (Twilio / Jazz SMS / Telenor)
    this.logger.log(`[DEV] OTP for ${phone}: ${otp}`);
  }
}
