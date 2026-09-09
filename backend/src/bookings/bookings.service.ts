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

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    private readonly calendar: CalendarService,
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
  async book(roomId: string, dto: BookRoomDto, deviceId?: string): Promise<RoomStatus> {
    const status = await this.getStatus(roomId, { fromDevice: true });
    if (status.current) {
      throw new ConflictException('Room is busy');
    }
    if (dto.durationMinutes > status.availableMinutes) {
      throw new ConflictException(
        `Only ${status.availableMinutes} minutes are available before the next meeting`,
      );
    }

    const start = new Date();
    const end = addMinutes(start, dto.durationMinutes);
    const deviceName = deviceId ? await this.deviceName(deviceId) : null;
    const title = dto.title?.trim() || 'Walk-in meeting';

    const event = await this.calendar.createEvent(status.room.calendarId, {
      title,
      description: `Booked from the room tablet${deviceName ? ` (${deviceName})` : ''}.`,
      start,
      end,
    });
    await this.upsertCheckIn(roomId, event, { confirmedAt: start });
    this.logger.log(
      `Booked "${title}" in ${status.room.name} for ${dto.durationMinutes} min`,
    );

    return this.getStatus(roomId, { fromDevice: true });
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
    room: Room,
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

  private async upsertCheckIn(
    roomId: string,
    event: CalendarEvent,
    patch: Partial<Pick<CheckIn, 'confirmedAt' | 'releasedAt'>>,
  ): Promise<CheckIn> {
    let record = await this.checkIns.findOne({ where: { roomId, eventId: event.id } });
    if (!record) {
      record = this.checkIns.create({
        roomId,
        eventId: event.id,
        eventStartsAt: toDate(event.start),
        confirmedAt: null,
        releasedAt: null,
      });
    }
    Object.assign(record, patch);
    return this.checkIns.save(record);
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

function toDate(iso: string): Date {
  return new Date(iso);
}
