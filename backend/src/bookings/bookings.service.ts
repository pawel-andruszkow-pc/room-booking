import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addMinutes, differenceInMinutes, endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { CalendarChangesService } from '../calendar/calendar-changes.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarEvent } from '../calendar/calendar.types';
import { DevicesService } from '../devices/devices.service';
import { Room } from '../rooms/room.entity';
import { RoomsService } from '../rooms/rooms.service';
import { AppSettings } from '../settings/app-settings.entity';
import { SettingsService } from '../settings/settings.service';
import { CheckIn } from './check-in.entity';
import { BookRoomDto } from './dto/book-room.dto';
import { RoomDay, RoomStatus } from './room-status';

interface StatusOptions {
  /**
   * True when a tablet in the room asks. Only then may a new presence prompt
   * start — rooms without a tablet must never be auto-released because nobody
   * could have confirmed.
   */
  fromDevice: boolean;
}

/** Bookings shorter than this are deleted rather than shortened when ended. */
const MIN_EVENT_MINUTES = 1;

/** Meetings starting within this many ms of the previous end count as back-to-back. */
const BACK_TO_BACK_TOLERANCE_MS = 60_000;

/** A start time this close to now is treated as "now" rather than a reservation. */
const START_NOW_TOLERANCE_MS = 60_000;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    private readonly calendar: CalendarService,
    private readonly changes: CalendarChangesService,
    private readonly rooms: RoomsService,
    private readonly devices: DevicesService,
    private readonly settings: SettingsService,
  ) {}

  /** Computes the live state of a room from today's calendar and check-in records. */
  async getStatus(roomId: string, opts: StatusOptions): Promise<RoomStatus> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const { dayEnd } = this.dayBounds(now, settings.timezone);

    const events = await this.todaysEvents(room, now, settings.timezone);
    let current =
      events.find((e) => toDate(e.start) <= now && toDate(e.end) > now) ?? null;
    const next = events.find((e) => toDate(e.start) > now) ?? null;

    let checkIn: RoomStatus['checkIn'] = null;
    let releasedEventId: string | null = null;
    if (current && settings.checkInEnabled) {
      const result = await this.resolveCheckIn(room, current, now, settings, opts);
      if (result.released) {
        releasedEventId = current.id;
        current = null;
      } else {
        checkIn = result.status;
      }
    }

    const busyUntil = current ? busyBlockEnd(current, events) : null;
    const freeUntil = current ? null : next ? toDate(next.start) : dayEnd;
    const availableMinutes = current
      ? 0
      : Math.max(
          0,
          Math.min(settings.maxBookingMinutes, differenceInMinutes(freeUntil!, now)),
        );

    const state: RoomStatus['state'] = !current
      ? 'free'
      : checkIn?.pending
        ? 'awaiting-check-in'
        : 'busy';

    return {
      room: {
        id: room.id,
        name: room.name,
        location: room.location,
        capacity: room.capacity,
        calendarId: room.calendarId,
      },
      now: now.toISOString(),
      state,
      current,
      next,
      busyUntil: busyUntil ? busyUntil.toISOString() : null,
      checkIn,
      freeUntil: freeUntil ? freeUntil.toISOString() : null,
      availableMinutes,
      events: events.filter((e) => toDate(e.end) > now && e.id !== releasedEventId),
      settings: {
        checkInEnabled: settings.checkInEnabled,
        checkInMinutes: settings.checkInMinutes,
        pollIntervalSeconds: settings.pollIntervalSeconds,
        maxBookingMinutes: settings.maxBookingMinutes,
        timezone: settings.timezone,
      },
    };
  }

  /** Every timed event today (including finished ones) for the "Today" page. */
  async getDay(roomId: string): Promise<RoomDay> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const { dayStart, dayEnd } = this.dayBounds(now, settings.timezone);
    const events = await this.todaysEvents(room, now, settings.timezone);
    return {
      room: {
        id: room.id,
        name: room.name,
        location: room.location,
        capacity: room.capacity,
      },
      now: now.toISOString(),
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      timezone: settings.timezone,
      events,
    };
  }

  /** Creates an ad-hoc meeting starting now. Presence is implicitly confirmed. */
  /**
   * Books the room, either from now ("book this room now") or for a slot later
   * today when `startsAt` is given.
   *
   * The two differ in more than the start time: a walk-in is checked in on the
   * spot, because the people asking for the room are standing at the tablet.
   * A reservation made in advance is not — it goes through the normal presence
   * prompt when it starts, so a slot nobody turns up for is released again.
   */
  async book(roomId: string, dto: BookRoomDto, deviceId?: string): Promise<RoomStatus> {
    const status = await this.getStatus(roomId, { fromDevice: true });
    const now = new Date();
    const scheduled = dto.startsAt ? new Date(dto.startsAt) : null;
    // A reservation for (nearly) now is a walk-in: the tablet may have had the
    // time on screen for a few seconds before the tap landed. Only that narrow
    // window counts — a start further in the past is a mistake to reject, not
    // a booking to quietly move to the current time.
    const immediate =
      !scheduled ||
      Math.abs(scheduled.getTime() - now.getTime()) <= START_NOW_TOLERANCE_MS;
    const start = immediate ? now : scheduled;
    const end = addMinutes(start, dto.durationMinutes);

    if (immediate) {
      if (status.current) {
        throw new ConflictException('Room is busy');
      }
      if (dto.durationMinutes > status.availableMinutes) {
        throw new ConflictException(
          `Only ${status.availableMinutes} minutes are available before the next meeting`,
        );
      }
    } else {
      await this.assertSlotIsFree(status.room, start, end, now);
    }

    const deviceName = deviceId ? await this.deviceName(deviceId) : null;
    const title =
      dto.title?.trim() || (immediate ? 'Walk-in meeting' : 'Room reservation');

    const event = await this.calendar.createEvent(status.room.calendarId, {
      title,
      description: `Booked from the room tablet${deviceName ? ` (${deviceName})` : ''}.`,
      start,
      end,
    });
    if (immediate) await this.upsertCheckIn(roomId, event, { confirmedAt: start });
    // Other tablets on this room should not wait for the next tick or for Google.
    this.changes.notify(status.room.calendarId);
    this.logger.log(
      `Booked "${title}" in ${status.room.name} for ${dto.durationMinutes} min` +
        (immediate ? '' : ` starting ${start.toISOString()}`),
    );

    return this.getStatus(roomId, { fromDevice: true });
  }

  /**
   * A slot booked in advance has to be today, still ahead, and clear of every
   * meeting already in the calendar — the walk-in path's "minutes until the
   * next meeting" check says nothing about a gap later in the day.
   */
  private async assertSlotIsFree(
    room: Pick<Room, 'calendarId'>,
    start: Date,
    end: Date,
    now: Date,
  ): Promise<void> {
    const settings = await this.settings.get();
    const { dayEnd } = this.dayBounds(now, settings.timezone);
    if (start <= now) {
      throw new BadRequestException('That time has already passed');
    }
    if (end > dayEnd) {
      throw new BadRequestException('A booking has to end on the same day');
    }

    const events = await this.todaysEvents(room, now, settings.timezone);
    const clash = events.find((e) => toDate(e.start) < end && toDate(e.end) > start);
    if (clash) {
      throw new ConflictException(`Overlaps "${clash.title}"`);
    }
  }

  /** "End meeting": shortens the running event so the room frees up immediately. */
  async endMeeting(roomId: string, eventId: string): Promise<RoomStatus> {
    const { room, event } = await this.findRunningEvent(roomId, eventId);
    await this.truncateEvent(room, event, new Date());
    await this.upsertCheckIn(roomId, event, { confirmedAt: new Date() });
    this.logger.log(`Ended "${event.title}" in ${room.name}`);
    return this.getStatus(roomId, { fromDevice: true });
  }

  /** "Yes, we are here." */
  async confirmPresence(roomId: string, eventId: string): Promise<RoomStatus> {
    const { event } = await this.findRunningEvent(roomId, eventId);
    await this.upsertCheckIn(roomId, event, { confirmedAt: new Date() });
    return this.getStatus(roomId, { fromDevice: true });
  }

  /** "No, nobody showed up" — same effect as the timeout. */
  async release(roomId: string, eventId: string): Promise<RoomStatus> {
    const { room, event } = await this.findRunningEvent(roomId, eventId);
    await this.releaseEvent(room, event, new Date());
    return this.getStatus(roomId, { fromDevice: true });
  }

  /** Releases every pending check-in whose deadline passed. Called by the cron job. */
  async releaseExpired(): Promise<number> {
    const rooms = await this.rooms.findAll();
    let released = 0;
    for (const room of rooms) {
      try {
        const before = await this.pendingCheckIn(room.id);
        if (!before) continue;
        const status = await this.getStatus(room.id, { fromDevice: false });
        if (status.state === 'free') released += 1;
      } catch (err) {
        this.logger.warn(`Auto-release check failed for ${room.name}: ${String(err)}`);
      }
    }
    return released;
  }

  // ---------------------------------------------------------------------------

  private async resolveCheckIn(
    room: Room,
    current: CalendarEvent,
    now: Date,
    settings: AppSettings,
    opts: StatusOptions,
  ): Promise<{ released: boolean; status: RoomStatus['checkIn'] }> {
    const deadline = addMinutes(toDate(current.start), settings.checkInMinutes);
    const deadlineIso = deadline.toISOString();
    let record = await this.checkIns.findOne({
      where: { roomId: room.id, eventId: current.id },
    });

    if (!record) {
      if (!opts.fromDevice) {
        // No tablet is asking; don't start a prompt nobody can answer.
        return { released: false, status: null };
      }
      if (now > deadline) {
        // The tablet came online too late to ask — assume the meeting is on.
        record = await this.upsertCheckIn(room.id, current, { confirmedAt: now });
      } else {
        record = await this.upsertCheckIn(room.id, current, {});
      }
    }

    if (record.releasedAt) {
      // Calendar may lag behind our shortening; treat the room as free.
      return { released: true, status: null };
    }
    if (record.confirmedAt) {
      return {
        released: false,
        status: { pending: false, confirmed: true, deadline: deadlineIso },
      };
    }
    if (now > deadline) {
      await this.releaseEvent(room, current, now);
      return { released: true, status: null };
    }
    return {
      released: false,
      status: { pending: true, confirmed: false, deadline: deadlineIso },
    };
  }

  private async releaseEvent(room: Room, event: CalendarEvent, at: Date): Promise<void> {
    await this.truncateEvent(room, event, at);
    await this.upsertCheckIn(room.id, event, { releasedAt: at });
    this.logger.log(`Released ${room.name}: nobody confirmed "${event.title}"`);
  }

  /** Ends an event at `at`; events that barely started are removed instead. */
  private async truncateEvent(room: Room, event: CalendarEvent, at: Date): Promise<void> {
    const start = toDate(event.start);
    if (differenceInMinutes(at, start) < MIN_EVENT_MINUTES) {
      await this.calendar.deleteEvent(room.calendarId, event.id);
    } else {
      await this.calendar.updateEventEnd(room.calendarId, event.id, at);
    }
    this.changes.notify(room.calendarId);
  }

  private async findRunningEvent(
    roomId: string,
    eventId: string,
  ): Promise<{ room: Room; event: CalendarEvent }> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const events = await this.todaysEvents(room, now, settings.timezone);
    const event = events.find((e) => e.id === eventId);
    if (!event) throw new BadRequestException("Event not found in today's calendar");
    if (toDate(event.start) > now || toDate(event.end) <= now) {
      throw new ConflictException('Event is not running right now');
    }
    return { room, event };
  }

  private async todaysEvents(
    room: Pick<Room, 'calendarId'>,
    now: Date,
    timezone: string,
  ): Promise<CalendarEvent[]> {
    const { dayStart, dayEnd } = this.dayBounds(now, timezone);
    const events = await this.calendar.listEvents(room.calendarId, dayStart, dayEnd);
    return events
      .filter((e) => !e.isAllDay)
      .sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime());
  }

  private dayBounds(now: Date, timezone: string): { dayStart: Date; dayEnd: Date } {
    const zoned = toZonedTime(now, timezone);
    return {
      dayStart: fromZonedTime(startOfDay(zoned), timezone),
      dayEnd: fromZonedTime(endOfDay(zoned), timezone),
    };
  }

  private async pendingCheckIn(roomId: string): Promise<CheckIn | null> {
    return this.checkIns
      .createQueryBuilder('c')
      .where('c.roomId = :roomId', { roomId })
      .andWhere('c.confirmedAt IS NULL')
      .andWhere('c.releasedAt IS NULL')
      .getOne();
  }

  /**
   * Creates or updates the presence record for one event.
   *
   * Two requests can reach this for the same (room, event) at once: booking
   * from the tablet inserts a confirmed record right after creating the event,
   * while a status poll that already sees the new event inserts a pending one.
   * The unique index makes one of them fail; the loser merges its patch into
   * the row that won, so both orderings converge on the same result.
   */
  private async upsertCheckIn(
    roomId: string,
    event: CalendarEvent,
    patch: Partial<Pick<CheckIn, 'confirmedAt' | 'releasedAt'>>,
  ): Promise<CheckIn> {
    const existing = await this.checkIns.findOne({
      where: { roomId, eventId: event.id },
    });
    if (existing) {
      Object.assign(existing, patch);
      return this.checkIns.save(existing);
    }

    const created = this.checkIns.create({
      roomId,
      eventId: event.id,
      eventStartsAt: toDate(event.start),
      confirmedAt: null,
      releasedAt: null,
      ...patch,
    });
    try {
      return await this.checkIns.save(created);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.checkIns.findOneOrFail({
        where: { roomId, eventId: event.id },
      });
      Object.assign(winner, patch);
      return this.checkIns.save(winner);
    }
  }

  private async deviceName(deviceId: string): Promise<string | null> {
    try {
      const device = await this.devices.findOne(deviceId);
      return device.name;
    } catch {
      return null;
    }
  }
}

/**
 * End of the busy block `current` belongs to: keeps extending through every
 * later meeting that starts before (or within a minute of) the running end.
 * `events` are sorted by start.
 */
function busyBlockEnd(current: CalendarEvent, events: CalendarEvent[]): Date {
  let end = toDate(current.end);
  for (const event of events) {
    if (toDate(event.start).getTime() > end.getTime() + BACK_TO_BACK_TOLERANCE_MS) break;
    if (toDate(event.end) > end) end = toDate(event.end);
  }
  return end;
}

function toDate(iso: string): Date {
  return new Date(iso);
}

/** Postgres unique-violation (SQLSTATE 23505) — a concurrent insert won. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (e?.driverError?.code ?? e?.code) === '23505';
}
