import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySetPasswordTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}
