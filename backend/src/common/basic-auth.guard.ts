import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { safeEqual } from './safe-equal';

/**
 * Global guard: every route needs `Authorization: Basic <base64 user:pass>`
 * matching BASIC_AUTH_USER / BASIC_AUTH_PASSWORD, unless marked @Public().
 *
 * The 401 deliberately omits a `WWW-Authenticate` header so browsers never
 * show their native credential dialog on top of the kiosk UI; the SPA handles
 * sign-in on its own login page and stores the credentials locally.
 */
@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const credentials = parseBasicHeader(request.headers.authorization);
    if (!credentials) {
      throw new UnauthorizedException('Missing credentials');
    }

    const expectedUser = process.env.BASIC_AUTH_USER ?? '';
    const expectedPassword = process.env.BASIC_AUTH_PASSWORD ?? '';
    const ok =
      safeEqual(credentials.user, expectedUser) &&
      safeEqual(credentials.password, expectedPassword);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return true;
  }
}

function parseBasicHeader(header?: string): { user: string; password: string } | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}
