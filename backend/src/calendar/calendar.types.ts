export type CalendarSource = 'google' | 'local';

/** Provider-agnostic calendar event as exposed to the frontend. */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  organizer: string | null;
  /** ISO-8601 timestamps. */
  start: string;
  end: string;
  isAllDay: boolean;
  source: CalendarSource;
  htmlLink: string | null;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  start: Date;
  end: Date;
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: CalendarSource;
  /** Calendar display name when the connection works. */
  summary?: string;
  error?: string;
}

/** A calendar the credentials can see — used to import Workspace room resources. */
export interface CalendarSummary {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** Parsed from names like "ROOMS-6th floor-Yellow (4)" when present. */
  capacity: number | null;
  /** Whether the credentials may modify events (needed to end/release meetings). */
  canWrite: boolean;
}

/**
 * Contract every calendar backend implements. Kept deliberately small — the
 * booking logic only ever needs today's events plus create / shorten / delete.
 */
export interface CalendarProvider {
  readonly name: CalendarSource;
  listCalendars(): Promise<CalendarSummary[]>;
  listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]>;
  createEvent(calendarId: string, input: CreateEventInput): Promise<CalendarEvent>;
  /**
   * Ends the event at `end`. Providers that cannot edit foreign events (a
   * Workspace resource calendar holding a copy of someone else's meeting) may
   * instead make the room decline the event, which frees the room just the same.
   */
  updateEventEnd(calendarId: string, eventId: string, end: Date): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  testConnection(calendarId: string): Promise<ConnectionTestResult>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

/** Extracts a trailing "(N)" capacity marker from a Workspace resource name. */
export function parseCapacity(name: string | null | undefined): number | null {
  const match = name?.match(/\((\d{1,4})\)\s*$/);
  return match ? Number(match[1]) : null;
}
