import { Injectable, Logger } from '@nestjs/common';
import { auth as googleAuth, calendar, calendar_v3 } from '@googleapis/calendar';
import {
  CalendarEvent,
  CalendarProvider,
  CalendarSummary,
  ConnectionTestResult,
  CreateEventInput,
  parseCapacity,
} from './calendar.types';

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

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const rawKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
    if (!email || !rawKey) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are required for CALENDAR_PROVIDER=google',
      );
    }

    // Env files usually carry the key with escaped newlines and sometimes quotes.
    const key = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    const subject = process.env.GOOGLE_IMPERSONATE_USER?.trim() || undefined;

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
        if (!item.id) continue;
        out.push({
          id: item.id,
          summary: item.summaryOverride ?? item.summary ?? item.id,
          description: item.description ?? null,
          location: item.location ?? null,
          capacity: parseCapacity(item.summary),
          canWrite: item.accessRole === 'writer' || item.accessRole === 'owner',
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out.sort((a, b) => a.summary.localeCompare(b.summary));
  }

  async listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const res = await this.api().events.list({
      calendarId,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 100,
    });

    return (res.data.items ?? [])
      .filter((item) => item.status !== 'cancelled' && !isDeclinedByRoom(item))
      .map(toCalendarEvent)
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

/** Resource calendars keep events the room itself declined; those never block the room. */
function isDeclinedByRoom(item: calendar_v3.Schema$Event): boolean {
  return (item.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined');
}

function isForbidden(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 403 || status === 403;
}

function toCalendarEvent(item: calendar_v3.Schema$Event): CalendarEvent | null {
  const startRaw = item.start?.dateTime ?? item.start?.date;
  const endRaw = item.end?.dateTime ?? item.end?.date;
  if (!item.id || !startRaw || !endRaw) return null;

  const isAllDay = !item.start?.dateTime;
  return {
    id: item.id,
    title: item.summary?.trim() || 'Busy',
    description: item.description ?? null,
    organizer: item.organizer?.displayName ?? item.organizer?.email ?? null,
    start: new Date(startRaw).toISOString(),
    end: new Date(endRaw).toISOString(),
    isAllDay,
    source: 'google',
    htmlLink: item.htmlLink ?? null,
  };
}
