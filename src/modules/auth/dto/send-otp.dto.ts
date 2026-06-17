import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '03001234567', description: '11-digit Pakistani mobile number' })
  @IsString()
  @Matches(/^0\d{10}$/, { message: 'Enter a valid Pakistani phone number' })
  phone: string;
}
