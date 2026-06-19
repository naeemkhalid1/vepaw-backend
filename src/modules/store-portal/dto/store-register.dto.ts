import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreRegisterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerName: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  storeAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ntn: string;

  @ApiProperty()
  @IsString()
  @MinLength(13)
  ownerCnic: string;

  @ApiPropertyOptional()
  @IsOptional()
  businessProof?: { name: string; status: string } | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  payoutMethod: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  merchantAccount: string;
}
