import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import {
  AdminAuthController,
  AdminOverviewController,
  AdminController,
  AdminUsersController,
  AdminTransactionsController,
  AdminCommissionsController,
  AdminBroadcastsController,
  AdminReportsController,
} from './admin.controller';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { Order, OrderSchema } from '../../database/schemas/order.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Pet, PetSchema } from '../../database/schemas/pet.schema';
import { VetApplication, VetApplicationSchema } from '../../database/schemas/vet-application.schema';
import { CommissionTier, CommissionTierSchema } from '../../database/schemas/commission-tier.schema';
import { Broadcast, BroadcastSchema } from '../../database/schemas/broadcast.schema';
import { Payout, PayoutSchema } from '../../database/schemas/payout.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vet.name, schema: VetSchema },
      { name: User.name, schema: UserSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Pet.name, schema: PetSchema },
      { name: VetApplication.name, schema: VetApplicationSchema },
      { name: CommissionTier.name, schema: CommissionTierSchema },
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: Payout.name, schema: PayoutSchema },
    ]),
  ],
  controllers: [
    AdminAuthController,
    AdminOverviewController,
    AdminController,
    AdminUsersController,
    AdminTransactionsController,
    AdminCommissionsController,
    AdminBroadcastsController,
    AdminReportsController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
