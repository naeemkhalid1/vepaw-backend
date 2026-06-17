import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePetDto {
  @ApiProperty({ example: 'Simba' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['dog', 'cat', 'bird', 'exotic', 'other'] })
  @IsIn(['dog', 'cat', 'bird', 'exotic', 'other'])
  species: string;

  @ApiProperty({ example: 'Persian' })
  @IsString()
  @IsNotEmpty()
  breed: string;

  @ApiProperty({ example: '2021-01-15', description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth: string;

  @ApiProperty({ example: 4.2, description: 'Weight in kg' })
  @IsNumber()
  @IsPositive()
  weight: number;

  @ApiProperty({ enum: ['male', 'female'] })
  @IsIn(['male', 'female'])
  gender: string;
}
