import {
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { Public } from '../../common/decorators/public.decorator';
import { SafepayService } from '../../common/payments/safepay.service';
import { SafepayWebhookEvent } from '../../common/payments/safepay-webhook-event.interface';

@ApiExcludeController()
@Public()
@Controller('appointments/webhooks')
export class AppointmentsWebhookController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
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
    await this.appointmentsService.handleSafepayEvent(event);

    return { received: true };
  }
}
