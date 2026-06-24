import { IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class StoreProfileDto {
  @IsString() @IsNotEmpty() storeName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsNotEmpty() fullAddress: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() areasServed: string;
}

class DeliverySettingsDto {
  @IsOptional() @IsString() freeDeliveryOver?: string;
  @IsString() deliveryFee: string;
  @IsBoolean() sameDayEnabled: boolean;
  @IsString() sameDayCutoff: string;
}

class BusinessHoursDto {
  @IsArray() openDays: string[];
  @IsString() opens: string;
  @IsString() closes: string;
}

class StorePayoutInfoDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() initials?: string;
  @IsOptional() @IsString() maskedNumber?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() warning?: string;
}

export class UpdateStoreSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StoreProfileDto)
  profile?: StoreProfileDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliverySettingsDto)
  delivery?: DeliverySettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BusinessHoursDto)
  businessHours?: BusinessHoursDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorePayoutInfoDto)
  payout?: StorePayoutInfoDto;
}
