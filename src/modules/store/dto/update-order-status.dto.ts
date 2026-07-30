import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Customer-facing order status update — deliberately cancel-only. Fulfillment transitions
// (confirmed/packed/dispatched/delivered) are a separate, store-owned action reached via
// StorePortalService.updateOrderStatus(), never from the pet-owner app.
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['cancelled'], description: 'Only cancellation is supported here.' })
  @IsIn(['cancelled'])
  status: 'cancelled';
}
