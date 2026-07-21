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
import { StoreService } from './store.service';
import { Public } from '../../common/decorators/public.decorator';
import { SafepayService } from '../../common/payments/safepay.service';
import { SafepayWebhookEvent } from '../../common/payments/safepay-webhook-event.interface';

@ApiExcludeController()
@Public()
@Controller('mobile/store/orders/webhooks')
export class StoreOrdersWebhookController {
  constructor(
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
    await this.storeService.handleSafepayEvent(event);

    return { received: true };
  }
}
