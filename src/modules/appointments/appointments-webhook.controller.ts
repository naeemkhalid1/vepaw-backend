import {
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { ConsultationsService } from '../consultations/consultations.service';
import { StoreService } from '../store/store.service';
import { Public } from '../../common/decorators/public.decorator';
import { SafepayService } from '../../common/payments/safepay.service';
import {
  SafepayWebhookEvent,
  extractOrderId,
} from '../../common/payments/safepay-webhook-event.interface';

// Safepay ties each event type (payment.succeeded, payment.failed, ...) to exactly ONE
// endpoint per merchant account — confirmed by dashboard error "event payment.succeeded
// already subscribed on another endpoint" when trying to register it on more than one URL.
// So this single endpoint is the only one Safepay will ever call, for every domain
// (appointments, consultations, store orders) — it dispatches by order_id (the domain
// record's own _id, set as Safepay's order_id at checkout-session creation time in every
// domain's createCheckoutSession call) rather than relying on separate URLs per domain.
// consultations-webhook.controller.ts and store-webhook.controller.ts are kept in place
// (e.g. for direct/manual testing) but Safepay itself should only ever be configured to call
// this one.
@ApiExcludeController()
@Public()
@Controller('appointments/webhooks')
export class AppointmentsWebhookController {
  private readonly logger = new Logger(AppointmentsWebhookController.name);

  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly consultationsService: ConsultationsService,
    private readonly storeService: StoreService,
    private readonly safepayService: SafepayService,
  ) {}

  @Post('safepay')
  async handleSafepayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sfpy-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (
      !req.rawBody ||
      !this.safepayService.verifyWebhookSignature(req.rawBody, signature)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = JSON.parse(
      req.rawBody.toString('utf8'),
    ) as SafepayWebhookEvent;

    const orderId = extractOrderId(event);
    if (!orderId) {
      this.logger.warn(`Safepay webhook missing order_id, cannot route: ${JSON.stringify(event)}`);
      return { received: true };
    }

    if (await this.appointmentsService.ownsOrderId(orderId)) {
      await this.appointmentsService.handleSafepayEvent(event);
    } else if (await this.consultationsService.ownsOrderId(orderId)) {
      await this.consultationsService.handleSafepayEvent(event);
    } else if (await this.storeService.ownsOrderId(orderId)) {
      await this.storeService.handleSafepayEvent(event);
    } else {
      this.logger.warn(
        `Safepay webhook order_id ${orderId} did not match any appointment reservation, consultation session, or store order`,
      );
    }

    return { received: true };
  }
}
