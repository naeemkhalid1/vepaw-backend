import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnregisterFcmDto {
  @ApiProperty({ example: 'eR3mT9xLq...' })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}
