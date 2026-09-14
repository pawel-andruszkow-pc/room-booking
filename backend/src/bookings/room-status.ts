import { CalendarEvent } from '../calendar/calendar.types';
import { Room } from '../rooms/room.entity';

/**
 * `busy-soon` is the middle ground: the room is still free, but the next
 * meeting is minutes away — long enough to walk in, not long enough to start
 * anything. It is the one free state that offers "I'm already here".
 */
export type RoomState = 'free' | 'busy-soon' | 'busy' | 'awaiting-check-in';

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
  /** Full-day reservations, clamped to this day. The room is busy all day when non-empty. */
  allDay: CalendarEvent[];
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
  /**
   * The meeting the room is busy with. A full-day event (`isAllDay` — an
   * all-day entry or a timed one covering the whole day) is a reservation of
   * the day: it is never asked about and cannot be ended from the tablet.
   */
  current: CalendarEvent | null;
  next: CalendarEvent | null;
  /**
   * When the room actually becomes free: the end of the chain of meetings that
   * follow each other without a gap (null while free). Differs from
   * `current.end` when another meeting starts the moment this one ends.
   */
  busyUntil: string | null;
  checkIn: CheckInStatus | null;
  /** When the room is free: ISO time the next meeting starts, or end of the day. */
  freeUntil: string | null;
  /**
   * True once somebody has said "I'm already here" for `next`, so it starts as
   * busy instead of asking. Only ever true while the state is `busy-soon`.
   */
  upcomingConfirmed: boolean;
  /** Longest ad-hoc booking that fits right now (0 while busy). */
  availableMinutes: number;
  /** Remaining events today, including the current one; a full-day reservation comes first. */
  events: CalendarEvent[];
  settings: {
    checkInEnabled: boolean;
    checkInMinutes: number;
    pollIntervalSeconds: number;
    maxBookingMinutes: number | null;
    timezone: string;
  };
}
