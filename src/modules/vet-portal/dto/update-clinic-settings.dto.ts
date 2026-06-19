import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
  @IsString() lunchBreak: string;
  @IsNumber() bookableSlotsPerDay: number;
}

class PayoutInfoDto {
  @IsString() method: string;
  @IsString() methodInitials: string;
  @IsString() accountHolder: string;
  @IsString() maskedNumber: string;
  @IsString() commissionRate: string;
  @IsString() commissionLabel: string;
}

class NotificationSettingDto {
  @IsString() id: string;
  @IsString() label: string;
  @IsString() channel: string;
  @IsString() icon: string;
  @IsBoolean() enabled: boolean;
}

export class UpdateClinicSettingsDto {
  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => ClinicProfileDto)
  profile: ClinicProfileDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsultationSettingsDto)
  consultation: ConsultationSettingsDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => AvailabilitySettingsDto)
  availability: AvailabilitySettingsDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => PayoutInfoDto)
  payout: PayoutInfoDto;

  @ApiProperty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationSettingDto)
  notifications: NotificationSettingDto[];
}
