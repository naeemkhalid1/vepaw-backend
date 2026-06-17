import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePrivacyDto {
  @ApiPropertyOptional({ description: 'Share live location while using app' })
  @IsOptional()
  @IsBoolean()
  locationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Show vet reviews publicly' })
  @IsOptional()
  @IsBoolean()
  showReviews?: boolean;

  @ApiPropertyOptional({ description: 'Personalised product recommendations' })
  @IsOptional()
  @IsBoolean()
  personalised?: boolean;
}
