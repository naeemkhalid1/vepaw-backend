import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { VetsController } from './vets.controller';
import { VetsService } from './vets.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vet.name, schema: VetSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [VetsController],
  providers: [VetsService],
  exports: [VetsService],
})
export class VetsModule {}
