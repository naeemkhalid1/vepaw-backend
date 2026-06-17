import { IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListVetsDto {
  @ApiPropertyOptional({ description: 'Search by name or clinic name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'DHA Phase 5' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: 'dermatology' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ description: 'Maximum fee (PKR)', example: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxFee?: number;

  @ApiPropertyOptional({ description: 'Latitude for distance calculation', example: 31.5204 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for distance calculation', example: 74.3436 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(100)
  limit?: number = 20;
}
