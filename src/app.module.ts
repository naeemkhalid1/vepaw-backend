import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './common/redis/redis.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PetsModule } from './modules/pets/pets.module';
import { VetsModule } from './modules/vets/vets.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StoreModule } from './modules/store/store.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SymptomCheckModule } from './modules/symptom-check/symptom-check.module';
import { CommunityModule } from './modules/community/community.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { StorePortalModule } from './modules/store-portal/store-portal.module';
import { VetPortalModule } from './modules/vet-portal/vet-portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    ScheduleModule.forRoot(),

    RedisModule,
    EmailModule,

    AuthModule,
    UsersModule,
    PetsModule,
    VetsModule,
    AppointmentsModule,
    PaymentsModule,
    StoreModule,
    SubscriptionsModule,
    SymptomCheckModule,
    CommunityModule,
    MessagesModule,
    NotificationsModule,
    AdminModule,
    RealtimeModule,
    StorePortalModule,
    VetPortalModule,
  ],
})
export class AppModule {}
