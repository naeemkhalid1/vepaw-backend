import {
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  product: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class DeliveryAddressDto {
  @ApiProperty({ example: 'House 12, A Block' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'DHA Phase 5' })
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiProperty({ example: 'Lahore' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ enum: ['Home', 'Work', 'Other'], nullable: true })
  @IsOptional()
  @IsIn(['Home', 'Work', 'Other'])
  label?: string | null;
}

export class PlaceOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 4250, description: 'Client total — validated server-side' })
  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @ApiProperty({ enum: ['jazzcash', 'easypaisa', 'cod'] })
  @IsIn(['jazzcash', 'easypaisa', 'cod'])
  paymentMethod: 'jazzcash' | 'easypaisa' | 'cod';

  @ApiProperty({ type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;
}
