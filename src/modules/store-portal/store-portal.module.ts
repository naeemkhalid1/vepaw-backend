import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../../database/schemas/order.schema';
import { Product, ProductSchema } from '../../database/schemas/product.schema';
import { Store, StoreSchema } from '../../database/schemas/store.schema';
import { Review, ReviewSchema } from '../../database/schemas/review.schema';
import { Payout, PayoutSchema } from '../../database/schemas/payout.schema';
import { Invite, InviteSchema } from '../../database/schemas/invite.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { StorePortalService } from './store-portal.service';
import {
  StoreOrdersController,
  StoreSubscriptionsController,
  StoreProductsController,
  StoreBulkImportController,
  StorePayoutsController,
  StoreReviewsController,
  StoreTeamController,
  StoreSettingsController,
  StoreRegistrationController,
  StoreInviteController,
} from './store-portal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Store.name, schema: StoreSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Invite.name, schema: InviteSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    StoreOrdersController,
    StoreSubscriptionsController,
    StoreBulkImportController,
    StoreProductsController,
    StorePayoutsController,
    StoreReviewsController,
    StoreTeamController,
    StoreSettingsController,
    StoreRegistrationController,
    StoreInviteController,
  ],
  providers: [StorePortalService],
})
export class StorePortalModule {}
