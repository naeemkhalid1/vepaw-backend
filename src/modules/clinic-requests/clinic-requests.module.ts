import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClinicDispense, ClinicDispenseSchema } from '../../database/schemas/clinic-dispense.schema';
import { Listing, ListingSchema } from '../../database/schemas/listing.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Thread, ThreadSchema } from '../../database/schemas/thread.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { ClinicRequestsController } from './clinic-requests.controller';
import { ClinicRequestsService } from './clinic-requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClinicDispense.name, schema: ClinicDispenseSchema },
      { name: Listing.name, schema: ListingSchema },
      { name: Pet.name, schema: PetSchema },
      { name: Vet.name, schema: VetSchema },
      { name: Thread.name, schema: ThreadSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [ClinicRequestsController],
  providers: [ClinicRequestsService],
  exports: [ClinicRequestsService],
})
export class ClinicRequestsModule {}
