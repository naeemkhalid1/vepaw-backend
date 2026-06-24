import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'rejected', 'refunded'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: ['active', 'paused', 'cancelled'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ['active', 'hidden'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateTeamMemberStatusDto {
  @ApiProperty({ enum: ['active', 'deactivated', 'revoked'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdatePayoutAccountDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
