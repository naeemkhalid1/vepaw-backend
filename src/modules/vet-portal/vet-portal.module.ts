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
    ]),
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
  ],
  providers: [VetPortalService],
})
export class VetPortalModule {}
