import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteTeamMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;
}
