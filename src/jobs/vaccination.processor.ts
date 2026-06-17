import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class VaccinationProcessor {
  private readonly logger = new Logger(VaccinationProcessor.name);

  async updateVaccinationStatuses(): Promise<void> {
    this.logger.log('Running vaccination status update');
  }

  async sendDueReminders(): Promise<void> {
    this.logger.log('Sending vaccination due-in-7-days reminders');
  }
}
