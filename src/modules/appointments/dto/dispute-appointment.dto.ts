import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisputeAppointmentDto {
  @ApiProperty({ example: 'The vet never actually examined my pet.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
