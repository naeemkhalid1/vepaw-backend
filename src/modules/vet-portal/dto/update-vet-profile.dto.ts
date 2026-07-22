import { IsArray, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Personal profile fields — same shape for admin_vet/team_vet/manager, since each staff member
// is their own Vet document. Deliberately excludes clinicName/phone/address/payout, which stay
// on the clinic-settings endpoint (business identity, not personal identity).
export class UpdateVetProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Whole number as a string, same convention as onboarding' })
  @IsOptional()
  @IsString()
  yearsExperience?: string;

  // multipart/form-data only delivers a real array when the field is repeated 2+ times
  // (languages=en&languages=ur) — a single occurrence arrives as a bare string, so normalize
  // before validating rather than rejecting the single-language case.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
}
