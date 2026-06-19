import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlockSlotsDto {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  slotIds: string[];
}
