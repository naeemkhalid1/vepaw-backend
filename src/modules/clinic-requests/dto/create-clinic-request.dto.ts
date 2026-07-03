import { IsInt, IsMongoId, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClinicRequestDto {
  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d2' })
  @IsMongoId()
  listingId: string;

  @ApiProperty({ example: '64a3f2c1b5d6e7f8a9b0c1d3' })
  @IsMongoId()
  petId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}
