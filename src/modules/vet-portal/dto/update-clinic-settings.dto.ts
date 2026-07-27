import {
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ClinicProfileDto {
  @IsString() @IsNotEmpty() clinicName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsNotEmpty() fullAddress: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() @IsNotEmpty() area: string;
  // From the map pin-drop location picker (ClinicProfileCard) — real coordinates for distance
  // search, independent of whatever text ends up in fullAddress/city/area.
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

class ConsultationSettingsDto {
  @IsString() inPersonFee: string;
  @IsString() videoConsultFee: string;
  @IsOptional() @IsString() textConsultFee?: string;
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
  @IsIn(['jazzcash', 'easypaisa', 'bank_transfer']) method: 'jazzcash' | 'easypaisa' | 'bank_transfer';
  @IsOptional() @IsString() methodInitials?: string;
  @IsString() accountHolder: string;

  @ValidateIf((o: PayoutInfoDto) => o.method === 'jazzcash' || o.method === 'easypaisa')
  @IsString()
  @Matches(/^03\d{9}$/, { message: 'walletNumber must be an 11-digit Pakistani mobile number (e.g. 03001234567)' })
  walletNumber?: string;

  @ValidateIf((o: PayoutInfoDto) => o.method === 'bank_transfer')
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @ValidateIf((o: PayoutInfoDto) => o.method === 'bank_transfer')
  @IsString()
  @MinLength(5)
  accountNumber?: string;

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
