import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreRegisterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerName: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  storeAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ntn: string;

  @ApiProperty()
  @IsString()
  @MinLength(13)
  ownerCnic: string;

  @ApiPropertyOptional()
  @IsOptional()
  businessProof?: { name: string; status: string } | null;

  @ApiProperty({ enum: ['jazzcash', 'easypaisa', 'bank_transfer'] })
  @IsString()
  @IsIn(['jazzcash', 'easypaisa', 'bank_transfer'])
  payoutMethod: 'jazzcash' | 'easypaisa' | 'bank_transfer';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountTitle?: string;

  @ApiPropertyOptional({ description: "11-digit wallet number, required when payoutMethod is 'jazzcash' or 'easypaisa'" })
  @ValidateIf((o: StoreRegisterDto) => o.payoutMethod === 'jazzcash' || o.payoutMethod === 'easypaisa')
  @IsString()
  @Matches(/^03\d{9}$/, { message: 'walletNumber must be an 11-digit Pakistani mobile number (e.g. 03001234567)' })
  walletNumber?: string;

  @ApiPropertyOptional({ description: "Required when payoutMethod is 'bank_transfer'" })
  @ValidateIf((o: StoreRegisterDto) => o.payoutMethod === 'bank_transfer')
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @ApiPropertyOptional({ description: "Bank account number or IBAN, required when payoutMethod is 'bank_transfer'" })
  @ValidateIf((o: StoreRegisterDto) => o.payoutMethod === 'bank_transfer')
  @IsString()
  @MinLength(5)
  accountNumber?: string;
}
