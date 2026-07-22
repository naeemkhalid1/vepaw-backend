import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Drives storage policy in VetPortalService.uploadFile — 'cnic' goes to private storage since
// it's government ID, everything else is a public URL. Optional + defaults to the public path
// so a caller that omits it (or sends something unrecognized) still gets a working upload.
export class UploadOnboardingDocumentDto {
  @ApiPropertyOptional({ enum: ['pvmcLicense', 'degreeCertificate', 'cnic', 'clinicPhoto'] })
  @IsOptional()
  @IsIn(['pvmcLicense', 'degreeCertificate', 'cnic', 'clinicPhoto'])
  documentType?: 'pvmcLicense' | 'degreeCertificate' | 'cnic' | 'clinicPhoto';
}
