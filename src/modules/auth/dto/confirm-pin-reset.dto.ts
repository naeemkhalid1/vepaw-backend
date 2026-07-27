import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPinResetDto {
  @ApiProperty({ example: '123456', description: '6-digit code sent via SMS' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code: string;
}
