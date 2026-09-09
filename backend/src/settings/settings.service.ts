import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { safeEqual } from '../common/safe-equal';
import { PinScope } from '../common/require-pin.decorator';
import { AppSettings } from './app-settings.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type CalendarProviderName = 'local' | 'google';

/** Settings safe to send to any authenticated client (no PINs). */
export interface PublicSettings {
  checkInEnabled: boolean;
  checkInMinutes: number;
  timezone: string;
  pollIntervalSeconds: number;
  maxBookingMinutes: number;
  calendarProvider: CalendarProviderName;
  /** Service-account e-mail the admin must share room calendars with. */
  googleServiceAccountEmail: string | null;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: AppSettings | null = null;

  constructor(
    @InjectRepository(AppSettings) private readonly repo: Repository<AppSettings>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensure();
  }

  /** Returns the settings row, creating it from env defaults on first boot. */
  async ensure(): Promise<AppSettings> {
    if (this.cache) return this.cache;
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.repo.create({
        id: 1,
        settingsPin: process.env.SETTINGS_PIN?.trim() || '1234',
        adminPin: process.env.ADMIN_PIN?.trim() || '0000',
        timezone: process.env.TIMEZONE?.trim() || 'Europe/Warsaw',
      });
      row = await this.repo.save(row);
      this.logger.log('Created default app settings from environment.');
    }
    this.cache = row;
    return row;
  }

  async get(): Promise<AppSettings> {
    return this.ensure();
  }

  async getPublic(): Promise<PublicSettings> {
    const s = await this.ensure();
    return {
      checkInEnabled: s.checkInEnabled,
      checkInMinutes: s.checkInMinutes,
      timezone: s.timezone,
      pollIntervalSeconds: s.pollIntervalSeconds,
      maxBookingMinutes: s.maxBookingMinutes,
      calendarProvider: this.calendarProvider,
      googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null,
    };
  }

  get calendarProvider(): CalendarProviderName {
    return process.env.CALENDAR_PROVIDER === 'google' ? 'google' : 'local';
  }

  async update(dto: UpdateSettingsDto): Promise<PublicSettings> {
    const current = await this.ensure();
    Object.assign(current, stripUndefined(dto));
    this.cache = await this.repo.save(current);
    return this.getPublic();
  }

  async verifyPin(scope: PinScope, pin: string): Promise<boolean> {
    const s = await this.ensure();
    const expected = scope === 'admin' ? s.adminPin : s.settingsPin;
    return safeEqual(pin, expected);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
