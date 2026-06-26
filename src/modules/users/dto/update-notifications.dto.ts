import { IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class NotificationChannelsDto {
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

class NotificationTypesDto {
  @IsOptional() @IsBoolean() vaccination?: boolean;
  @IsOptional() @IsBoolean() appointment?: boolean;
  @IsOptional() @IsBoolean() order?: boolean;
  @IsOptional() @IsBoolean() promotions?: boolean;
}

export class UpdateNotificationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationTypesDto)
  types?: NotificationTypesDto;
}
