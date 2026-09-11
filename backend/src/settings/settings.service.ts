import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { appConfig } from '../config/app-config';
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
  /** Null means a walk-in may take the room until the next meeting. */
  maxBookingMinutes: number | null;
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
      const config = appConfig();
      row = this.repo.create({
        id: 1,
        settingsPin: config.pins.settings,
        adminPin: config.pins.admin,
        timezone: config.timezone,
        pollIntervalSeconds: config.pollIntervalSeconds,
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
      googleServiceAccountEmail: appConfig().calendar.google.serviceAccountEmail,
    };
  }

  get calendarProvider(): CalendarProviderName {
    return appConfig().calendar.provider;
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
