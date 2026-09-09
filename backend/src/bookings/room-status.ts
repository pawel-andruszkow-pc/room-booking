import { CalendarEvent } from '../calendar/calendar.types';
import { Room } from '../rooms/room.entity';

export type RoomState = 'free' | 'busy' | 'awaiting-check-in';

/** Whole-day agenda for the "Today" page. Returned by GET /rooms/:id/today. */
export interface RoomDay {
  room: Pick<Room, 'id' | 'name' | 'location' | 'capacity'>;
  now: string;
  /** ISO bounds of the calendar day in the room's timezone. */
  dayStart: string;
  dayEnd: string;
  timezone: string;
  /** All timed events today, past ones included, sorted by start. */
  events: CalendarEvent[];
}

export interface CheckInStatus {
  /** True while the tablet should show the "Is this meeting happening?" prompt. */
  pending: boolean;
  confirmed: boolean;
  /** ISO timestamp after which an unconfirmed meeting is released. */
  deadline: string;
}

/** Everything a tablet needs to render one room. Returned by GET /rooms/:id/status. */
export interface RoomStatus {
  room: Pick<Room, 'id' | 'name' | 'location' | 'capacity' | 'calendarId'>;
  /** Server time — the tablet syncs its clock offset from this. */
  now: string;
  state: RoomState;
  current: CalendarEvent | null;
  next: CalendarEvent | null;
  checkIn: CheckInStatus | null;
  /** When the room is free: ISO time the next meeting starts, or end of the day. */
  freeUntil: string | null;
  /** Longest ad-hoc booking that fits right now (0 while busy). */
  availableMinutes: number;
  /** Remaining timed events today, including the current one. */
  events: CalendarEvent[];
  settings: {
    checkInEnabled: boolean;
    checkInMinutes: number;
    pollIntervalSeconds: number;
    maxBookingMinutes: number;
    timezone: string;
  };
}
