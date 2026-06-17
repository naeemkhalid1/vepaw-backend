import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Vet.name, schema: VetSchema },
      { name: Pet.name, schema: PetSchema },
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
