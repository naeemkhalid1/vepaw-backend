import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlockSlotsDto {
  @ApiProperty({ example: '2026-06-25' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  slotIds: string[];
}
