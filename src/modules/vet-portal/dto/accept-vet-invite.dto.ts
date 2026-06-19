import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptVetInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  fullName: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  confirmPassword: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pvmcNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  yearsOfExperience: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  primaryQualification: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consultationFee: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  specialisations: string[];

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiPropertyOptional()
  @IsOptional()
  pvmcLicense?: { name: string; status: string } | null;

  @ApiPropertyOptional()
  @IsOptional()
  cnic?: { name: string; status: string } | null;
}
