import { SetMetadata } from '@nestjs/common';

export const CLINIC_ROLES_KEY = 'clinicRoles';
export const ClinicRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CLINIC_ROLES_KEY, roles);
