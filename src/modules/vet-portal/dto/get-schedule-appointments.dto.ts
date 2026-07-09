import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetScheduleAppointmentsDto {
  @ApiPropertyOptional({ example: '2026-07-09', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-09', description: 'Defaults to startDate if omitted' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
