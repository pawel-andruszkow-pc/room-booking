import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SettingsService } from '../settings/settings.service';
import { PIN_SCOPE_KEY, PinScope } from './require-pin.decorator';

/**
 * Global guard enforcing @RequirePin(). Runs after BasicAuthGuard (guards are
 * evaluated in registration order), so the caller is already authenticated.
 */
@Injectable()
export class PinGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<PinScope | undefined>(PIN_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const adminPin = headerValue(request, 'x-admin-pin');
    const settingsPin = headerValue(request, 'x-settings-pin');

    // The admin PIN is a superset: it unlocks settings-scoped routes as well.
    if (adminPin && (await this.settings.verifyPin('admin', adminPin))) return true;
    if (scope === 'settings' && settingsPin) {
      if (await this.settings.verifyPin('settings', settingsPin)) return true;
    }

    throw new ForbiddenException(
      scope === 'admin' ? 'Admin PIN required' : 'Settings PIN required',
    );
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
