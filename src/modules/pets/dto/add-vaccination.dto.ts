import { IsBoolean, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddVaccinationDto {
  @ApiProperty({ example: 'Rabies' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2026-06-17', description: 'Date given — YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '2027-06-17', description: 'Next due date — YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'nextDue must be YYYY-MM-DD' })
  nextDue: string;

  @ApiProperty({ example: 'Dr. Tariq Mehmood' })
  @IsString()
  @IsNotEmpty()
  vetName: string;

  @ApiPropertyOptional({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsOptional()
  @IsMongoId()
  vetId?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({ example: 'Given at Pet Express DHA' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'https://cdn.vepaw.pk/certs/cert_001.jpg' })
  @IsOptional()
  @IsString()
  certificatePhoto?: string;
}
