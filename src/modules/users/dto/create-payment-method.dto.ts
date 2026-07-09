import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Meezan Bank', description: 'Free text — not validated against a fixed provider list' })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({ example: '03001234567', description: '11-digit account/mobile number — masked before being returned' })
  @IsString()
  @Matches(/^0\d{10}$/, { message: 'Enter a valid Pakistani phone number' })
  phoneNumber: string;
}
