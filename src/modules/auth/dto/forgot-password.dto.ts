import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;
}
