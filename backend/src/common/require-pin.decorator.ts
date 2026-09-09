import { SetMetadata } from '@nestjs/common';

export type PinScope = 'settings' | 'admin';

export const PIN_SCOPE_KEY = 'pinScope';

/**
 * Requires the caller to send a valid PIN header in addition to Basic auth:
 *  - 'settings' → `X-Settings-Pin` (the admin PIN is accepted too)
 *  - 'admin'    → `X-Admin-Pin`
 * Tablets share one Basic credential, so PINs are what separates "anyone in
 * the office" from "the person allowed to reconfigure this tablet / the rooms".
 */
export const RequirePin = (scope: PinScope) => SetMetadata(PIN_SCOPE_KEY, scope);
