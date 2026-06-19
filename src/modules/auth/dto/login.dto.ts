import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;
}
