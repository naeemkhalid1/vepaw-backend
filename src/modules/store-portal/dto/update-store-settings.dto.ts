import { IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class StoreProfileDto {
  @IsString() @IsNotEmpty() storeName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsNotEmpty() fullAddress: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() areasServed: string;
}

class DeliverySettingsDto {
  @IsString() freeDeliveryOver: string;
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
  @IsString() label: string;
  @IsString() initials: string;
  @IsString() maskedNumber: string;
  @IsString() subtitle: string;
  @IsString() warning: string;
}

export class UpdateStoreSettingsDto {
  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => StoreProfileDto)
  profile: StoreProfileDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliverySettingsDto)
  delivery: DeliverySettingsDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => BusinessHoursDto)
  businessHours: BusinessHoursDto;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  @Type(() => StorePayoutInfoDto)
  payout: StorePayoutInfoDto;
}
