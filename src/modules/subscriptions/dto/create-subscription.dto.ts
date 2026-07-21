import { IsIn, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ enum: ['weekly', 'biweekly', 'monthly', 'quarterly'] })
  @IsIn(['weekly', 'biweekly', 'monthly', 'quarterly'])
  interval: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

  @ApiProperty({ enum: ['safepay', 'cod'], description: 'Billing intent for this subscription' })
  @IsIn(['safepay', 'cod'])
  paymentMethod: 'safepay' | 'cod';
}
