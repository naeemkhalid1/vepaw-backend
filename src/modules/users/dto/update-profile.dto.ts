import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ayesha Tariq' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'ayesha@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @ApiPropertyOptional({ example: 'DHA Phase 5' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: 'https://cdn.vepaw.pk/avatars/user.jpg' })
  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @ApiPropertyOptional({ enum: ['en', 'ur'] })
  @IsOptional()
  @IsIn(['en', 'ur'])
  language?: 'en' | 'ur';
}
