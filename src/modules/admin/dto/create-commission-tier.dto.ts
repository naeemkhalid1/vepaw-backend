import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommissionTierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rate: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  appliesTo: string;
}
