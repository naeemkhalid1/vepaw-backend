import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommissionTierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rate: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  appliesTo: string;
}
