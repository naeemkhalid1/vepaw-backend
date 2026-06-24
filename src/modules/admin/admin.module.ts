import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
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
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as any },
      }),
    }),
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
    forwardRef(() => AuthModule),
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
