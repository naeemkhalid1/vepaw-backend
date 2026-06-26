import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '03001234567' })
  @IsString()
  @Matches(/^0\d{10}$/, { message: 'Enter a valid Pakistani phone number' })
  phone: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP received via SMS' })
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'OTP must be a 4 to 6 digit code' })
  otp: string;
}
