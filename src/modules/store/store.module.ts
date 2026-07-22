import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreController } from './store.controller';
import { StoreOrdersWebhookController } from './store-webhook.controller';
import { StoreService } from './store.service';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Order, OrderSchema } from '../../database/schemas/order.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [StoreController, StoreOrdersWebhookController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
