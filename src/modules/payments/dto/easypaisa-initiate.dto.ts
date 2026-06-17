import { IsMongoId, IsNumber, IsPositive, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EasypaisaInitiateDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  appointmentId: string;

  @ApiProperty({ example: 1500, description: 'Amount in PKR — validated server-side against appointment fee' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '03001234567' })
  @Matches(/^0\d{10}$/, { message: 'Enter a valid Pakistani phone number' })
  phone: string;
}
