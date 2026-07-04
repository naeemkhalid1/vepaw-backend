import { IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConsultationDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  vetId: string;

  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d3' })
  @IsMongoId()
  petId: string;
}
