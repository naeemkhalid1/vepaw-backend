import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterFcmDto {
  @ApiProperty({ example: 'eR3mT9xLq...' })
  @IsString()
  @IsNotEmpty()
  fcmToken: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}
