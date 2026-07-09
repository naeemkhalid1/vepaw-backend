import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteTeamMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  emailOrPhone: string;

  @ApiProperty({ enum: ['team_vet', 'accountant'] })
  @IsString()
  @IsIn(['team_vet', 'accountant'])
  role: 'team_vet' | 'accountant';
}
