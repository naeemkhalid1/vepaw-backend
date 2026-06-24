import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVetApplicationStatusDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 'PVMC license expired' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateStoreApplicationStatusDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 'Invalid NTN number' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateTransactionStatusDto {
  @ApiProperty({ enum: ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'rejected', 'refunded'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}
