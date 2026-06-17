import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: ['cancelled'] })
  @IsOptional()
  @IsIn(['cancelled'])
  status?: 'cancelled';

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Next scheduled delivery date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  nextOrderDate?: string;
}
