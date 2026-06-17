import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EmergencyVetsDto {
  @ApiProperty({ description: 'Latitude', example: 31.5204 })
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 74.3436 })
  @Type(() => Number)
  @IsNumber()
  lng: number;
}
