import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ClinicProfileDto {
  @IsString() @IsNotEmpty() clinicName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsNotEmpty() fullAddress: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() @IsNotEmpty() area: string;
}

class ConsultationSettingsDto {
  @IsString() inPersonFee: string;
  @IsString() videoConsultFee: string;
  @IsBoolean() inPersonEnabled: boolean;
  @IsBoolean() videoEnabled: boolean;
  @IsBoolean() textEnabled: boolean;
}

class AvailabilitySettingsDto {
  @IsArray() workingDays: string[];
  @IsString() opens: string;
  @IsString() closes: string;
  @IsString() slotLength: string;
  @IsString() lunchStart: string;
  @IsString() lunchEnd: string;
  @IsNumber() bookableSlotsPerDay: number;
}

class PayoutInfoDto {
  @IsString() method: string;
  @IsOptional() @IsString() methodInitials?: string;
  @IsString() accountHolder: string;
  @IsOptional() @IsString() maskedNumber?: string;
  @IsOptional() @IsString() commissionRate?: string;
  @IsOptional() @IsString() commissionLabel?: string;
}

class NotificationSettingDto {
  @IsString() id: string;
  @IsBoolean() enabled: boolean;
}

export class UpdateClinicSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClinicProfileDto)
  profile?: ClinicProfileDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsultationSettingsDto)
  consultation?: ConsultationSettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AvailabilitySettingsDto)
  availability?: AvailabilitySettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PayoutInfoDto)
  payout?: PayoutInfoDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationSettingDto)
  notifications?: NotificationSettingDto[];
}
