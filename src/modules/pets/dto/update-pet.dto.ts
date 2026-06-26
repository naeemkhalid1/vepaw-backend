import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePetDto {
  @ApiPropertyOptional({ example: 'Simba' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['dog', 'cat', 'bird', 'exotic', 'other'] })
  @IsOptional()
  @IsIn(['dog', 'cat', 'bird', 'exotic', 'other'])
  species?: string;

  @ApiPropertyOptional({ example: 'Persian' })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: string;

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  weight?: number;

  @ApiPropertyOptional({ example: 'white' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'https://cdn.vepaw.pk/pets/pet_001.jpg' })
  @IsOptional()
  @IsString()
  photo?: string;

  @ApiPropertyOptional({ enum: ['up_to_date', 'some_pending', 'not_sure'] })
  @IsOptional()
  @IsIn(['up_to_date', 'some_pending', 'not_sure'])
  vaccinationStatus?: 'up_to_date' | 'some_pending' | 'not_sure';

  @ApiPropertyOptional({ example: ['chicken', 'dust'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ example: ['Frontline monthly'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;
}
