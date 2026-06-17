import { IsIn, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListOrdersDto {
  @ApiPropertyOptional({
    enum: ['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'])
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
