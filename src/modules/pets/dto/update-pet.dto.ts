import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

function parseJsonArray({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

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
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  weight?: number;

  @ApiPropertyOptional({ example: 'white' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ enum: ['up_to_date', 'some_pending', 'not_sure'] })
  @IsOptional()
  @IsIn(['up_to_date', 'some_pending', 'not_sure'])
  vaccinationStatus?: 'up_to_date' | 'some_pending' | 'not_sure';

  @ApiPropertyOptional({ example: '["chicken","dust"]', type: String, description: 'JSON-stringified string array' })
  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ example: '["Frontline monthly"]', type: String, description: 'JSON-stringified string array' })
  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  remindersEnabled?: boolean;
}
