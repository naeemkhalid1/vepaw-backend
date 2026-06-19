import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitOnboardingDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  fullName: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clinicName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  fullAddress: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  specialisations: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  feeMin: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  feeMax: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  languages: string[];

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
  university: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalCertifications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  pvmcLicense?: { name: string; status: string } | null;

  @ApiPropertyOptional()
  @IsOptional()
  degreeCertificate?: { name: string; status: string } | null;

  @ApiPropertyOptional()
  @IsOptional()
  cnic?: { name: string; status: string } | null;

  @ApiPropertyOptional()
  @IsOptional()
  clinicPhoto?: { name: string; status: string } | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  payoutMethod: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountTitle: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  mobileAccount: string;

  @ApiProperty()
  @IsString()
  @MinLength(13)
  cnicOnAccount: string;
}
