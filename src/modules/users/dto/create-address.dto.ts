import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({ enum: ['Home', 'Work', 'Other'] })
  @IsIn(['Home', 'Work', 'Other'])
  label: 'Home' | 'Work' | 'Other';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiPropertyOptional({ default: 'Lahore' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
