import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NearbyVetsDto {
  @ApiProperty({ description: 'Latitude', example: 31.5204 })
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 74.3436 })
  @Type(() => Number)
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ default: 5, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(20)
  limit?: number = 5;
}
