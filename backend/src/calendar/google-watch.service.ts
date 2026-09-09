import {
  ForbiddenException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Subscription, debounceTime } from 'rxjs';
import { Repository } from 'typeorm';
import { appConfig } from '../config/app-config';
import { safeEqual } from '../common/safe-equal';
import { RoomEventsService } from '../rooms/room-events.service';
import { RoomsService } from '../rooms/rooms.service';
import { CalendarChangesService } from './calendar-changes.service';
import { CalendarWatch } from './calendar-watch.entity';
import { GoogleCalendarProvider } from './google-calendar.provider';

/** Route inside CalendarController (which is mounted at `calendar`). */
export const GOOGLE_WEBHOOK_ROUTE = 'webhooks/google';
/** Full path under the global `api` prefix Google posts notifications to. */
export const GOOGLE_WEBHOOK_PATH = `calendar/${GOOGLE_WEBHOOK_ROUTE}`;

/** Ask Google for week-long channels; it caps the value and tells us the real expiry. */
const CHANNEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-register this long before expiry so a few missed reconcile runs cannot lose push. */
const RENEW_MARGIN_MS = 12 * 60 * 60 * 1000;

/** Headers Google sets on every push notification (lower-cased by Express). */
export interface GoogleNotificationHeaders {
  'x-goog-channel-id'?: string;
  'x-goog-channel-token'?: string;
  'x-goog-resource-id'?: string;
  /** `sync` right after registration, otherwise `exists` / `not_exists`. */
  'x-goog-resource-state'?: string;
  'x-goog-message-number'?: string;
}

export interface PushStatus {
  /** False outside ENVIRONMENT=production, with the local provider or without PUBLIC_URL. */
  enabled: boolean;
  /** Human-readable reason when disabled, for the admin page. */
  disabledReason: string | null;
  /** Webhook Google posts to, for the admin to sanity-check. */
  address: string | null;
  channels: { calendarId: string; expiresAt: string }[];
}

/**
 * Keeps one Google push channel per active room calendar.
 *
 * Google Calendar's `events.watch` makes Google POST to our webhook whenever a
 * calendar changes; the request carries no event data, so on receipt we tell
 * CalendarChangesService and RoomStreamService re-reads the room. Channels are
 * reconciled against the rooms table on boot, whenever rooms change and every
 * ten minutes (for renewal). A missing channel just means the room is polled
 * at the normal rate, never a hard failure. Push needs a public https origin
 * (PUBLIC_URL), so with plain local development the service stays idle and the
 * fallback poll in RoomStreamService does all the work.
 */
@Injectable()
export class GoogleWatchService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GoogleWatchService.name);
  private roomEvents: Subscription | null = null;
  private running = false;
  private rerun = false;

  constructor(
    @InjectRepository(CalendarWatch) private readonly watches: Repository<CalendarWatch>,
    private readonly google: GoogleCalendarProvider,
    private readonly rooms: RoomsService,
    private readonly roomEventsBus: RoomEventsService,
    private readonly changes: CalendarChangesService,
  ) {}

  get enabled(): boolean {
    return this.disabledReason === null;
  }

  /** Why push is off, or null when every precondition holds. */
  get disabledReason(): string | null {
    const config = appConfig();
    if (config.environment !== 'production') return 'ENVIRONMENT is not production';
    if (config.calendar.provider !== 'google') return 'local calendar provider';
    if (config.publicUrl === null) return 'PUBLIC_URL not set';
    return null;
  }

  /** Full webhook URL, or null when no public origin is configured. */
  get address(): string | null {
    const { publicUrl } = appConfig();
    return publicUrl ? `${publicUrl}/api/${GOOGLE_WEBHOOK_PATH}` : null;
  }

  onApplicationBootstrap(): void {
    const why = this.disabledReason;
    if (why) {
      this.logger.log(`Google push notifications disabled (${why}); polling only`);
      return;
    }
    this.logger.log(`Google push notifications enabled, webhook ${this.address}`);
    // Coalesce bursts of admin edits into one reconcile.
    this.roomEvents = this.roomEventsBus.changed$
      .pipe(debounceTime(1000))
      .subscribe(() => void this.reconcile());
    void this.reconcile();
  }

  onModuleDestroy(): void {
    // Channels are deliberately left alive: they survive a redeploy and are
    // picked up by the next reconcile, so tablets never lose push over a restart.
    this.roomEvents?.unsubscribe();
    this.roomEvents = null;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async renew(): Promise<void> {
    if (this.enabled) await this.reconcile();
  }

  /**
   * Handles one notification. Returns quickly (Google retries on non-2xx and
   * counts slow endpoints against the channel); the calendar itself is
   * re-read asynchronously by the stream service.
   */
  async handleNotification(headers: GoogleNotificationHeaders): Promise<void> {
    const channelId = headers['x-goog-channel-id'];
    if (!channelId) throw new ForbiddenException('Not a Google Calendar notification');

    const watch = await this.watches.findOne({ where: { channelId } });
    if (!watch) {
      // A channel from a previous database / deployment. Answer 2xx so Google
      // stops retrying; it expires on its own.
      this.logger.debug(`Ignoring notification for unknown channel ${channelId}`);
      return;
    }
    if (!safeEqual(headers['x-goog-channel-token'] ?? '', watch.token)) {
      throw new ForbiddenException('Invalid channel token');
    }
    // The first message after registration only confirms the channel works.
    if (headers['x-goog-resource-state'] === 'sync') {
      this.logger.log(`Push channel confirmed for ${watch.calendarId}`);
      return;
    }
    this.changes.notify(watch.calendarId);
  }

  async status(): Promise<PushStatus> {
    const rows = this.enabled
      ? await this.watches.find({ order: { calendarId: 'ASC' } })
      : [];
    return {
      enabled: this.enabled,
      disabledReason: this.disabledReason,
      address: this.enabled ? this.address : null,
      channels: rows.map((row) => ({
        calendarId: row.calendarId,
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
  }

  /**
   * Makes the set of channels equal the set of active room calendars:
   * registers missing ones, drops orphans, renews those about to expire or
   * registered against a different webhook URL. Concurrent calls collapse
   * into one extra pass after the running one.
   */
  async reconcile(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.reconcileOnce();
      } while (this.rerun);
    } catch (err) {
      this.logger.error(`Push channel reconcile failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async reconcileOnce(): Promise<void> {
    const address = this.address;
    if (!address) return;

    const wanted = new Set((await this.rooms.findAll()).map((room) => room.calendarId));
    const existing = await this.watches.find();
    const byCalendar = new Map(existing.map((row) => [row.calendarId, row]));
    const now = Date.now();

    for (const row of existing) {
      if (!wanted.has(row.calendarId)) await this.stop(row, 'room removed');
    }

    for (const calendarId of wanted) {
      const row = byCalendar.get(calendarId);
      if (
        row &&
        row.address === address &&
        row.expiresAt.getTime() - now > RENEW_MARGIN_MS
      ) {
        this.changes.setPushActive(calendarId, true);
        continue;
      }
      if (row) {
        await this.stop(
          row,
          row.address === address ? 'expiring' : 'webhook URL changed',
        );
      }
      await this.register(calendarId, address);
    }
  }

  private async register(calendarId: string, address: string): Promise<void> {
    const channelId = randomUUID();
    const token = randomBytes(24).toString('hex');
    try {
      const channel = await this.google.watchCalendar(calendarId, {
        channelId,
        token,
        address,
        expiresAt: new Date(Date.now() + CHANNEL_TTL_MS),
      });
      await this.watches.save(
        this.watches.create({
          calendarId,
          channelId,
          resourceId: channel.resourceId,
          address,
          token,
          expiresAt: channel.expiresAt,
        }),
      );
      this.changes.setPushActive(calendarId, true);
      this.logger.log(`Watching ${calendarId} until ${channel.expiresAt.toISOString()}`);
    } catch (err) {
      // Typically the calendar is not shared with the service account yet.
      // The fallback poll covers the room; the next reconcile retries.
      this.changes.setPushActive(calendarId, false);
      this.logger.warn(`Could not watch ${calendarId}: ${String(err)}`);
    }
  }

  private async stop(row: CalendarWatch, reason: string): Promise<void> {
    this.changes.setPushActive(row.calendarId, false);
    try {
      await this.google.stopChannel(row.channelId, row.resourceId);
    } catch (err) {
      // Best effort: an unstoppable channel expires by itself and its
      // notifications are ignored once the row is gone.
      this.logger.warn(`Could not stop channel for ${row.calendarId}: ${String(err)}`);
    }
    await this.watches.delete({ id: row.id });
    this.logger.log(`Stopped watching ${row.calendarId} (${reason})`);
  }
}
