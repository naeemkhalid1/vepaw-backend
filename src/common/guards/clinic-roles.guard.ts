import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLINIC_ROLES_KEY } from '../decorators/clinic-roles.decorator';

@Injectable()
export class ClinicRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredClinicRoles = this.reflector.getAllAndOverride<string[]>(CLINIC_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredClinicRoles || requiredClinicRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{
      user?: { role: string; staffRole?: string };
    }>();

    // Only ever gates 'vet' role requests — never blocks other roles or unauthenticated
    // (@Public()) routes, since this guard only makes sense once RolesGuard has already
    // established the caller is a vet.
    if (!user || user.role !== 'vet') return true;

    return requiredClinicRoles.includes(user.staffRole ?? '');
  }
}
