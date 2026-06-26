import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { TimeOff, TimeOffSchema } from '../../database/schemas/time-off.schema';
import { BlockedSlot, BlockedSlotSchema } from '../../database/schemas/blocked-slot.schema';
import { VetsController } from './vets.controller';
import { VetsService } from './vets.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vet.name, schema: VetSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: TimeOff.name, schema: TimeOffSchema },
      { name: BlockedSlot.name, schema: BlockedSlotSchema },
    ]),
  ],
  controllers: [VetsController],
  providers: [VetsService],
  exports: [VetsService],
})
export class VetsModule {}
