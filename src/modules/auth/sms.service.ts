import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  generateOtp(): string {
    return '123456';
  }

  async sendOtp(phone: string, otp: string): Promise<void> {
    this.logger.log(`[DEV] OTP for ${phone}: ${otp}`);
  }
}
