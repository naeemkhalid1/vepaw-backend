import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async dispatchFcmPush(payload: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    this.logger.log(`Dispatching FCM push to token: ${payload.token}`);
  }
}
