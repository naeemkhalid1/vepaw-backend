import { IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetAvailabilityDto {
  @ApiProperty({ description: 'Date to check — YYYY-MM-DD', example: '2026-06-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsNotEmpty()
  date: string;
}
