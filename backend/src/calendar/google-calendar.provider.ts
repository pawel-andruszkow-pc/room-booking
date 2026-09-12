import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { auth as googleAuth, calendar, calendar_v3 } from '@googleapis/calendar';
import { fromZonedTime } from 'date-fns-tz';
import { appConfig } from '../config/app-config';
import {
  CalendarEvent,
  CalendarProvider,
  CalendarSummary,
  ConnectionTestResult,
  CreateEventInput,
  parseCapacity,
} from './calendar.types';

export interface WatchChannelInput {
  /** Our channel id (any unique string ≤ 64 chars); Google echoes it back. */
  channelId: string;
  /** Secret echoed in X-Goog-Channel-Token so we can verify the sender. */
  token: string;
  /** Public https URL Google posts notifications to. */
  address: string;
  /** Requested expiry; Google may shorten it and returns the effective value. */
  expiresAt: Date;
}

export interface WatchChannel {
  resourceId: string;
  expiresAt: Date;
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Google Calendar backend using a service account.
 *
 * Rooms are expected to be Workspace resource calendars (e.g.
 * "ROOMS-6th floor-Yellow (4)"). People book them by adding the resource to a
 * normal event; the resource calendar then holds a copy of that event.
 *
 * Either share every room calendar with GOOGLE_SERVICE_ACCOUNT_EMAIL (with
 * "Make changes to events") or enable domain-wide delegation and set
 * GOOGLE_IMPERSONATE_USER to a Workspace user who manages the room calendars.
 * The client is built lazily so the local provider never needs credentials.
 */
@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google' as const;
  private readonly logger = new Logger(GoogleCalendarProvider.name);
  private client: calendar_v3.Calendar | null = null;

  private api(): calendar_v3.Calendar {
    if (this.client) return this.client;

    const {
      serviceAccountEmail: email,
      privateKey: key,
      impersonateUser,
    } = appConfig().calendar.google;
    if (!email || !key) {
      // Unreachable with CALENDAR_PROVIDER=google (config validation demands
      // both); this guards a provider constructed directly, e.g. in a test.
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are required for CALENDAR_PROVIDER=google',
      );
    }
    const subject = impersonateUser ?? undefined;

    const auth = new googleAuth.JWT({ email, key, scopes: SCOPES, subject });
    this.client = calendar({ version: 'v3', auth });
    this.logger.log(
      `Google Calendar client ready (${email}${subject ? `, impersonating ${subject}` : ''})`,
    );
    return this.client;
  }

  /** Calendars the credentials can see — room resources shared with the account. */
  async listCalendars(): Promise<CalendarSummary[]> {
    const out: CalendarSummary[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.api().calendarList.list({ pageToken, maxResults: 250 });
      for (const item of res.data.items ?? []) {
        if (item.id) out.push(toSummary(item));
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out.sort((a, b) => a.summary.localeCompare(b.summary));
  }

  /** Subscribes the service account to a calendar it was granted access to. */
  async addCalendar(calendarId: string): Promise<CalendarSummary> {
    try {
      const res = await this.api().calendarList.insert({
        requestBody: { id: calendarId },
      });
      if (!res.data.id) throw new Error('Google returned a calendar without an id');
      this.logger.log(`Subscribed to calendar ${res.data.id}`);
      return toSummary(res.data);
    } catch (err) {
      if (!isNotFound(err) && !isForbidden(err)) throw err;
      const email = appConfig().calendar.google.serviceAccountEmail;
      throw new NotFoundException(
        `Calendar "${calendarId}" was not found or is not shared with ${email}. ` +
          'Share it first (Workspace admin console, Buildings and resources, the room, Share), ' +
          'then try again.',
      );
    }
  }

  async listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    let items: calendar_v3.Schema$Event[];
    let timeZone: string | undefined;
    try {
      const res = await this.api().events.list({
        calendarId,
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        showDeleted: false,
        maxResults: 100,
      });
      items = res.data.items ?? [];
      timeZone = res.data.timeZone ?? undefined;
    } catch (err) {
      // The most common misconfiguration: a room whose calendar id does not
      // exist in Google (e.g. seed rooms made for the local provider) or was
      // not shared with the service account. Say so instead of dumping a
      // Gaxios stack trace on every poll.
      if (isNotFound(err) || isForbidden(err)) {
        const email = appConfig().calendar.google.serviceAccountEmail;
        throw new ServiceUnavailableException(
          `Calendar "${calendarId}" was not found or is not shared with ${email}. ` +
            'Fix the room on the admin page (Calendar tab → Load calendars).',
        );
      }
      throw err;
    }

    return items
      .filter((item) => item.status !== 'cancelled' && !isDeclinedByRoom(item))
      .map((item) => toCalendarEvent(item, timeZone))
      .filter((event): event is CalendarEvent => event !== null);
  }

  async createEvent(calendarId: string, input: CreateEventInput): Promise<CalendarEvent> {
    const res = await this.api().events.insert({
      calendarId,
      requestBody: {
        summary: input.title,
        description: input.description ?? undefined,
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
      },
    });
    const event = toCalendarEvent(res.data);
    if (!event) throw new Error('Google returned an event without timestamps');
    return event;
  }

  /**
   * Shortens the room's copy of the event. Google only lets the organizer (or a
   * delegated writer) change times on foreign events; when that is refused the
   * room declines the event instead, which also frees it.
   */
  async updateEventEnd(calendarId: string, eventId: string, end: Date): Promise<void> {
    try {
      await this.api().events.patch({
        calendarId,
        eventId,
        requestBody: { end: { dateTime: end.toISOString() } },
      });
    } catch (err) {
      if (!isForbidden(err)) throw err;
      this.logger.warn(
        `Cannot edit ${eventId} on ${calendarId}; declining as the room instead`,
      );
      await this.declineAsRoom(calendarId, eventId);
    }
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.api().events.delete({ calendarId, eventId });
    } catch (err) {
      if (!isForbidden(err)) throw err;
      await this.declineAsRoom(calendarId, eventId);
    }
  }

  async testConnection(calendarId: string): Promise<ConnectionTestResult> {
    try {
      const res = await this.api().calendars.get({ calendarId });
      return { ok: true, provider: 'google', summary: res.data.summary ?? calendarId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Calendar test failed for ${calendarId}: ${message}`);
      return { ok: false, provider: 'google', error: message };
    }
  }

  /**
   * Registers a push channel: Google POSTs to `address` whenever anything on
   * the calendar changes (the body is empty — we re-read the calendar).
   */
  async watchCalendar(
    calendarId: string,
    input: WatchChannelInput,
  ): Promise<WatchChannel> {
    const res = await this.api().events.watch({
      calendarId,
      requestBody: {
        id: input.channelId,
        type: 'web_hook',
        address: input.address,
        token: input.token,
        expiration: String(input.expiresAt.getTime()),
      },
    });
    const { resourceId, expiration } = res.data;
    if (!resourceId)
      throw new Error('Google returned a watch channel without a resourceId');
    return {
      resourceId,
      expiresAt: expiration ? new Date(Number(expiration)) : input.expiresAt,
    };
  }

  /** Stops a push channel. A channel Google no longer knows counts as stopped. */
  async stopChannel(channelId: string, resourceId: string): Promise<void> {
    try {
      await this.api().channels.stop({ requestBody: { id: channelId, resourceId } });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  /** Marks the room resource as "declined" on the event — Google's native no-show release. */
  private async declineAsRoom(calendarId: string, eventId: string): Promise<void> {
    const { data } = await this.api().events.get({ calendarId, eventId });
    const attendees = (data.attendees ?? []).map((a) =>
      a.self || a.email === calendarId ? { ...a, responseStatus: 'declined' } : a,
    );
    if (!attendees.some((a) => a.responseStatus === 'declined')) {
      attendees.push({ email: calendarId, resource: true, responseStatus: 'declined' });
    }
    await this.api().events.patch({
      calendarId,
      eventId,
      requestBody: { attendees },
    });
  }
}

function toSummary(item: calendar_v3.Schema$CalendarListEntry): CalendarSummary {
  const id = item.id ?? '';
  return {
    id,
    summary: item.summaryOverride ?? item.summary ?? id,
    description: item.description ?? null,
    location: item.location ?? null,
    capacity: parseCapacity(item.summary),
    canWrite: item.accessRole === 'writer' || item.accessRole === 'owner',
  };
}

/** Resource calendars keep events the room itself declined; those never block the room. */
function isDeclinedByRoom(item: calendar_v3.Schema$Event): boolean {
  return (item.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined');
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 404 || status === 404;
}

function isForbidden(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 403 || status === 403;
}

/**
 * `timeZone` is the calendar's own zone (from the events.list response). An
 * all-day event carries bare dates, and "2025-03-05" means midnight in that
 * zone — not UTC, which would shift the block by an hour or two and let it
 * spill into the wrong day.
 */
function toCalendarEvent(
  item: calendar_v3.Schema$Event,
  timeZone?: string,
): CalendarEvent | null {
  const startRaw = item.start?.dateTime ?? item.start?.date;
  const endRaw = item.end?.dateTime ?? item.end?.date;
  if (!item.id || !startRaw || !endRaw) return null;

  const isAllDay = !item.start?.dateTime;
  const toInstant = (raw: string): Date =>
    isAllDay && timeZone ? fromZonedTime(raw, timeZone) : new Date(raw);
  return {
    id: item.id,
    title: item.summary?.trim() || 'Busy',
    description: item.description ?? null,
    organizer: item.organizer?.displayName ?? item.organizer?.email ?? null,
    start: toInstant(startRaw).toISOString(),
    end: toInstant(endRaw).toISOString(),
    isAllDay,
    source: 'google',
    htmlLink: item.htmlLink ?? null,
  };
}
