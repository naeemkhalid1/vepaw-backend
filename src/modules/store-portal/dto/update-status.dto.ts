import { IsIn, IsNotEmpty, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled', 'rejected', 'refunded'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: ['active', 'paused', 'cancelled'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ['active', 'hidden'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdateTeamMemberStatusDto {
  @ApiProperty({ enum: ['active', 'deactivated', 'revoked'] })
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class UpdatePayoutAccountDto {
  @ApiProperty({ enum: ['jazzcash', 'easypaisa', 'bank_transfer'] })
  @IsString()
  @IsIn(['jazzcash', 'easypaisa', 'bank_transfer'])
  method: 'jazzcash' | 'easypaisa' | 'bank_transfer';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountTitle: string;

  @ApiPropertyOptional({ description: "11-digit wallet number, required when method is 'jazzcash' or 'easypaisa'" })
  @ValidateIf((o: UpdatePayoutAccountDto) => o.method === 'jazzcash' || o.method === 'easypaisa')
  @IsString()
  @Matches(/^03\d{9}$/, { message: 'walletNumber must be an 11-digit Pakistani mobile number (e.g. 03001234567)' })
  walletNumber?: string;

  @ApiPropertyOptional({ description: "Required when method is 'bank_transfer'" })
  @ValidateIf((o: UpdatePayoutAccountDto) => o.method === 'bank_transfer')
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @ApiPropertyOptional({ description: "Bank account number or IBAN, required when method is 'bank_transfer'" })
  @ValidateIf((o: UpdatePayoutAccountDto) => o.method === 'bank_transfer')
  @IsString()
  @MinLength(5)
  accountNumber?: string;
}
