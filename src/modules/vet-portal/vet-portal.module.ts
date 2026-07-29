import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Clinic, ClinicSchema } from '../../database/schemas/clinic.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import {
  AppointmentReservation,
  AppointmentReservationSchema,
} from '../../database/schemas/appointment-reservation.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Payout, PayoutSchema } from '../../database/schemas/payout.schema';
import {
  PayoutAccountAudit,
  PayoutAccountAuditSchema,
} from '../../database/schemas/payout-account-audit.schema';
import { Listing, ListingSchema } from '../../database/schemas/listing.schema';
import { Invite, InviteSchema } from '../../database/schemas/invite.schema';
import { TimeOff, TimeOffSchema } from '../../database/schemas/time-off.schema';
import { VisitNote, VisitNoteSchema } from '../../database/schemas/visit-note.schema';
import { VetApplication, VetApplicationSchema } from '../../database/schemas/vet-application.schema';
import { BlockedSlot, BlockedSlotSchema } from '../../database/schemas/blocked-slot.schema';
import { Thread, ThreadSchema } from '../../database/schemas/thread.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { ClinicDispense, ClinicDispenseSchema } from '../../database/schemas/clinic-dispense.schema';
import {
  ConsultationSession,
  ConsultationSessionSchema,
} from '../../database/schemas/consultation-session.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../../common/payments/payments.module';
import { VetPortalService } from './vet-portal.service';
import {
  VetScheduleController,
  VetPatientsController,
  VetReviewsController,
  VetEarningsController,
  VetPayoutsController,
  VetTeamController,
  VetNotificationsController,
  VetListingsController,
  VetClinicSettingsController,
  VetProfileController,
  VetAvailabilityController,
  VetOnboardingController,
  VetInviteController,
  VetChatController,
  VetRecommendController,
  VetRequestsController,
  VetConsultationsController,
} from './vet-portal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vet.name, schema: VetSchema },
      { name: Clinic.name, schema: ClinicSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentReservation.name, schema: AppointmentReservationSchema },
      { name: Pet.name, schema: PetSchema },
      { name: User.name, schema: UserSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: PayoutAccountAudit.name, schema: PayoutAccountAuditSchema },
      { name: Listing.name, schema: ListingSchema },
      { name: Invite.name, schema: InviteSchema },
      { name: TimeOff.name, schema: TimeOffSchema },
      { name: VisitNote.name, schema: VisitNoteSchema },
      { name: VetApplication.name, schema: VetApplicationSchema },
      { name: BlockedSlot.name, schema: BlockedSlotSchema },
      { name: Thread.name, schema: ThreadSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ClinicDispense.name, schema: ClinicDispenseSchema },
      { name: ConsultationSession.name, schema: ConsultationSessionSchema },
    ]),
    RealtimeModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [
    VetScheduleController,
    VetPatientsController,
    VetReviewsController,
    VetEarningsController,
    VetPayoutsController,
    VetTeamController,
    VetNotificationsController,
    VetListingsController,
    VetClinicSettingsController,
    VetProfileController,
    VetAvailabilityController,
    VetOnboardingController,
    VetInviteController,
    VetChatController,
    VetRecommendController,
    VetRequestsController,
    VetConsultationsController,
  ],
  providers: [VetPortalService],
})
export class VetPortalModule {}
