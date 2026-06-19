import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlockDayDto {
  @ApiProperty({ example: '2025-01-15' })
  @IsString()
  @IsNotEmpty()
  date: string;
}
