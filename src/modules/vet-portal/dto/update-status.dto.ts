import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: ['confirmed', 'inProgress', 'done', 'cancelled', 'noShow'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class AddVaccinationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  dateAdministered: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchNumber?: string;
}

export class RecommendProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerPhone: string;
}

export class UpdateListingStatusDto {
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

export class EarningsPeriodDto {
  @ApiPropertyOptional({ enum: ['30d', '6m', 'ytd'] })
  @IsOptional()
  @IsString()
  period?: string;
}
