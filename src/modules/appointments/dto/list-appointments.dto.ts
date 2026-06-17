import { IsIn, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAppointmentsDto {
  @ApiPropertyOptional({ enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'] })
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'completed', 'cancelled', 'no-show'])
  status?: string;

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
