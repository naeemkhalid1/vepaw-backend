import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendBroadcastDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  audience: string[];

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  channels: string[];
}
