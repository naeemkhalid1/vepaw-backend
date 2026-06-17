import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SymptomCheckDto {
  @ApiProperty({ example: 'dog', enum: ['dog', 'cat', 'bird', 'exotic'] })
  @IsIn(['dog', 'cat', 'bird', 'exotic'])
  species: string;

  @ApiProperty({ example: 'Labrador', description: 'Breed of the pet' })
  @IsString()
  @IsNotEmpty()
  breed: string;

  @ApiProperty({ example: 3, description: 'Age of the pet in years' })
  age: number;

  @ApiProperty({ example: ['vomiting', 'lethargy'], description: 'List of observed symptoms' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  symptoms: string[];

  @ApiPropertyOptional({ example: 'Started yesterday after eating grass', description: 'Extra context' })
  @IsOptional()
  @IsString()
  notes?: string;
}
