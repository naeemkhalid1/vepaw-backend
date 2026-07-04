import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Payout, PayoutSchema } from '../../database/schemas/payout.schema';
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
import { VetPortalService } from './vet-portal.service';
import {
  VetScheduleController,
  VetPatientsController,
  VetReviewsController,
  VetEarningsController,
  VetPayoutsController,
  VetTeamController,
  VetListingsController,
  VetClinicSettingsController,
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
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Pet.name, schema: PetSchema },
      { name: User.name, schema: UserSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Payout.name, schema: PayoutSchema },
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
  ],
  controllers: [
    VetScheduleController,
    VetPatientsController,
    VetReviewsController,
    VetEarningsController,
    VetPayoutsController,
    VetTeamController,
    VetListingsController,
    VetClinicSettingsController,
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
