import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import {
  AppointmentReservation,
  AppointmentReservationSchema,
} from '../../database/schemas/appointment-reservation.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { Clinic, ClinicSchema } from '../../database/schemas/clinic.schema';
import { ClinicTeamModule } from '../../common/vets/clinic-team.module';
import { PaymentsModule } from '../../common/payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { StoreModule } from '../store/store.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsWebhookController } from './appointments-webhook.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      {
        name: AppointmentReservation.name,
        schema: AppointmentReservationSchema,
      },
      { name: Review.name, schema: ReviewSchema },
      { name: Vet.name, schema: VetSchema },
      { name: Pet.name, schema: PetSchema },
      { name: Clinic.name, schema: ClinicSchema },
    ]),
    ClinicTeamModule,
    PaymentsModule,
    NotificationsModule,
    ConsultationsModule,
    StoreModule,
  ],
  controllers: [AppointmentsController, AppointmentsWebhookController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
