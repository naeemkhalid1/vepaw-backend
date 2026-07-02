import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Thread, ThreadSchema } from '../../database/schemas/thread.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { TrackingGateway } from './gateways/tracking.gateway';
import { ChatGateway } from './gateways/chat.gateway';
import { CallsGateway } from './gateways/calls.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Thread.name, schema: ThreadSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Pet.name, schema: PetSchema },
      { name: Vet.name, schema: VetSchema },
    ]),
  ],
  providers: [TrackingGateway, ChatGateway, CallsGateway],
  exports: [ChatGateway],
})
export class RealtimeModule {}
