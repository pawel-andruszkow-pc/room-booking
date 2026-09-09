/** DTOs mirrored from the backend (see backend/src/**). Keep in sync by hand. */

export type CalendarSource = 'google' | 'local';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  organizer: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  source: CalendarSource;
  htmlLink: string | null;
}

export interface Room {
  id: string;
  name: string;
  calendarId: string;
  location: string | null;
  capacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  name: string;
  roomId: string | null;
  room: Room | null;
  isKiosk: boolean;
  userAgent: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSettings {
  checkInEnabled: boolean;
  checkInMinutes: number;
  timezone: string;
  pollIntervalSeconds: number;
  maxBookingMinutes: number;
  calendarProvider: CalendarSource;
  googleServiceAccountEmail: string | null;
}

export type RoomState = 'free' | 'busy' | 'awaiting-check-in';

export interface CheckInStatus {
  pending: boolean;
  confirmed: boolean;
  deadline: string;
}

export interface RoomStatus {
  room: Pick<Room, 'id' | 'name' | 'location' | 'capacity' | 'calendarId'>;
  now: string;
  state: RoomState;
  current: CalendarEvent | null;
  next: CalendarEvent | null;
  /** End of the back-to-back block the current meeting belongs to; null while free. */
  busyUntil: string | null;
  checkIn: CheckInStatus | null;
  freeUntil: string | null;
  availableMinutes: number;
  events: CalendarEvent[];
  settings: {
    checkInEnabled: boolean;
    checkInMinutes: number;
    pollIntervalSeconds: number;
    maxBookingMinutes: number;
    timezone: string;
  };
}

export interface RoomDay {
  room: Pick<Room, 'id' | 'name' | 'location' | 'capacity'>;
  now: string;
  dayStart: string;
  dayEnd: string;
  timezone: string;
  events: CalendarEvent[];
}

export interface CalendarSummary {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  canWrite: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: CalendarSource;
  summary?: string;
  error?: string;
}

export interface CalendarProviderInfo {
  provider: CalendarSource;
  serviceAccountEmail: string | null;
  impersonatedUser: string | null;
  /** Google push notifications (events.watch) — off with the local provider or without PUBLIC_URL. */
  push: {
    enabled: boolean;
    disabledReason: string | null;
    address: string | null;
    channels: { calendarId: string; expiresAt: string }[];
  };
}

export type PinScope = 'settings' | 'admin';
