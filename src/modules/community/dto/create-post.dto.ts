import { IsArray, IsNotEmpty, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ example: 'Simba had his first vaccination today!' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ example: ['vaccination', 'health'], minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  topics: string[];

  @ApiPropertyOptional({ example: 'https://cdn.vepaw.pk/posts/abc.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'Simba' })
  @IsOptional()
  @IsString()
  petName?: string;

  @ApiPropertyOptional({ example: 'DHA Lahore' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'proud' })
  @IsOptional()
  @IsString()
  feeling?: string;
}
