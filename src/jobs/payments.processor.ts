import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PaymentsProcessor {
  private readonly logger = new Logger(PaymentsProcessor.name);

  async processWebhook(payload: Record<string, unknown>): Promise<void> {
    this.logger.log('Processing payment webhook');
  }
}
