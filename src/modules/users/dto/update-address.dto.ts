import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAddressDto {
  @ApiPropertyOptional({ enum: ['Home', 'Work', 'Other'] })
  @IsOptional()
  @IsIn(['Home', 'Work', 'Other'])
  label?: 'Home' | 'Work' | 'Other';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
