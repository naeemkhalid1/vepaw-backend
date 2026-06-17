import { IsIn, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListProductsDto {
  @ApiPropertyOptional({ enum: ['food', 'medicine', 'accessories', 'grooming', 'treats'] })
  @IsOptional()
  @IsIn(['food', 'medicine', 'accessories', 'grooming', 'treats'])
  category?: string;

  @ApiPropertyOptional({ enum: ['dog', 'cat', 'bird', 'exotic'] })
  @IsOptional()
  @IsIn(['dog', 'cat', 'bird', 'exotic'])
  petType?: string;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  q?: string;

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
