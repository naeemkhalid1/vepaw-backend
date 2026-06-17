import { IsIn, IsMongoId, IsNotEmpty, IsNumber, IsPositive, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  vetId: string;

  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d3' })
  @IsMongoId()
  petId: string;

  @ApiProperty({ example: '2026-06-20', description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: '11:00', description: 'HH:MM' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'timeSlot must be HH:MM' })
  @IsNotEmpty()
  timeSlot: string;

  @ApiProperty({ enum: ['jazzcash', 'easypaisa', 'cod'] })
  @IsIn(['jazzcash', 'easypaisa', 'cod'])
  paymentMethod: 'jazzcash' | 'easypaisa' | 'cod';

  @ApiProperty({ example: 1500, description: 'Fee shown to user — validated server-side' })
  @IsNumber()
  @IsPositive()
  fee: number;
}
