import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ConsultationSession,
  ConsultationSessionSchema,
} from '../../database/schemas/consultation-session.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Thread, ThreadSchema } from '../../database/schemas/thread.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConsultationSession.name, schema: ConsultationSessionSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Pet.name, schema: PetSchema },
      { name: Vet.name, schema: VetSchema },
      { name: Thread.name, schema: ThreadSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
