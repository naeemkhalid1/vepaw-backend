import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
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

  @ApiProperty({ enum: ['jazzcash', 'easypaisa', 'bank_transfer'] })
  @IsString()
  @IsIn(['jazzcash', 'easypaisa', 'bank_transfer'])
  payoutMethod: 'jazzcash' | 'easypaisa' | 'bank_transfer';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountTitle: string;

  @ApiPropertyOptional({ description: "11-digit wallet number, required when payoutMethod is 'jazzcash' or 'easypaisa'" })
  @ValidateIf((o: SubmitOnboardingDto) => o.payoutMethod === 'jazzcash' || o.payoutMethod === 'easypaisa')
  @IsString()
  @Matches(/^03\d{9}$/, { message: 'walletNumber must be an 11-digit Pakistani mobile number (e.g. 03001234567)' })
  walletNumber?: string;

  @ApiPropertyOptional({ description: "Required when payoutMethod is 'bank_transfer'" })
  @ValidateIf((o: SubmitOnboardingDto) => o.payoutMethod === 'bank_transfer')
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @ApiPropertyOptional({ description: "Bank account number or IBAN, required when payoutMethod is 'bank_transfer'" })
  @ValidateIf((o: SubmitOnboardingDto) => o.payoutMethod === 'bank_transfer')
  @IsString()
  @MinLength(5)
  accountNumber?: string;

  @ApiProperty()
  @IsString()
  @MinLength(13)
  cnicOnAccount: string;
}
