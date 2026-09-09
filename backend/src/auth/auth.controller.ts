import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { PinScope } from '../common/require-pin.decorator';
import { SettingsService } from '../settings/settings.service';
import { VerifyPinDto } from './dto/verify-pin.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * Reached only when the Basic credentials are valid (global guard), so the
   * SPA uses it to verify credentials entered on the login page.
   */
  @Get('me')
  me() {
    return {
      user: process.env.BASIC_AUTH_USER,
      calendarProvider: this.settings.calendarProvider,
    };
  }

  /**
   * Verifies a PIN for the settings or admin page and reports which PIN
   * matched. The admin PIN is accepted for the settings scope too; the SPA
   * uses the returned scope to open the admin page straight away in that case.
   */
  @Post('pin')
  @HttpCode(200)
  async verifyPin(@Body() dto: VerifyPinDto): Promise<{ ok: true; scope: PinScope }> {
    // Check admin first so the admin PIN always reports the 'admin' scope.
    if (await this.settings.verifyPin('admin', dto.pin))
      return { ok: true, scope: 'admin' };
    if (
      dto.scope === 'settings' &&
      (await this.settings.verifyPin('settings', dto.pin))
    ) {
      return { ok: true, scope: 'settings' };
    }
    // 403, not 401: the Basic credentials are valid, only the PIN is wrong.
    // A 401 would make the tablet think its credentials expired and sign out.
    throw new ForbiddenException('Wrong PIN');
  }
}
