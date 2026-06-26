import { IsBoolean, IsIn, IsMongoId, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  @ApiPropertyOptional({ description: 'Filter by store ID' })
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Search by name or description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Minimum price (PKR)' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price (PKR)' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Only vet-recommended products' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isVetRecommended?: boolean;

  @ApiPropertyOptional({ enum: ['newest', 'price_asc', 'price_desc', 'popular'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'popular'])
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' = 'newest';

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
