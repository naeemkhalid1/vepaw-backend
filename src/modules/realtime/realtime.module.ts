import { Module } from '@nestjs/common';
import { TrackingGateway } from './gateways/tracking.gateway';
import { ChatGateway } from './gateways/chat.gateway';
import { CallsGateway } from './gateways/calls.gateway';

@Module({
  providers: [TrackingGateway, ChatGateway, CallsGateway],
})
export class RealtimeModule {}
