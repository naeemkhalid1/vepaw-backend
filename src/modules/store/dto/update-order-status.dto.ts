import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class RiderDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'] })
  @IsIn(['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'])
  status: 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled';

  @ApiPropertyOptional({ type: RiderDto, description: 'Required when status = dispatched' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RiderDto)
  rider?: RiderDto;
}
