import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: ['paused', 'cancelled'] })
  @IsOptional()
  @IsIn(['paused', 'cancelled'])
  status?: 'paused' | 'cancelled';

  @ApiPropertyOptional({ enum: ['weekly', 'biweekly', 'monthly', 'quarterly'] })
  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly', 'quarterly'])
  interval?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Next scheduled delivery date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  nextOrderDate?: string;
}
