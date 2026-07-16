import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteTeamMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;

  @ApiProperty({ enum: ['team_vet', 'manager'] })
  @IsString()
  @IsIn(['team_vet', 'manager'])
  role: 'team_vet' | 'manager';
}
