import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Appointment, AppointmentSchema } from '../../database/schemas/appointment.schema';
import { Order, OrderSchema } from '../../database/schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vet.name, schema: VetSchema },
      { name: User.name, schema: UserSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
