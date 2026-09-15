import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  addMinutes,
  differenceInMinutes,
  endOfDay,
  startOfDay,
  startOfMinute,
  subMinutes,
} from 'date-fns';
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


/**
 * A meeting starting within this window makes the room "busy soon" rather than
 * free: too little time to start anything, and the moment when the people it
 * was booked for are walking in — so it is also the window in which they may
 * check in early. Mirrored by BUSY_SOON_MS in the tablet's RoomStore, which
 * turns the screen over on its own clock.
 */
const BUSY_SOON_MS = 5 * 60_000;

/**
 * How long past its deadline an unanswered presence prompt is still worth
 * chasing. The job behind it runs every minute, so a record still pending this
 * much later is not one a release can fix: the meeting it belongs to ended, or
 * left the calendar, before anybody answered. Such a record stays pending for
 * good — and unbounded, each one would send the job back to the calendar every
 * minute for the rest of the day. A tablet that is still polling releases a
 * meeting genuinely running on its own, without going through this.
 */
const RELEASE_GRACE_MINUTES = 15;

/**
 * Today's calendar, split the way the booking logic reads it. A full-day event
 * — an all-day entry, or a timed one that covers the whole day, which is how
 * some people book a room "for the day" — is a reservation of the whole day:
 * it is never asked about, never ended from the tablet, and blocks every slot.
 * So it is kept apart from the timed meetings the check-in and back-to-back
 * logic reason about, marked `isAllDay` either way, and its start and end are
 * clamped to the room's day, so a multi-day block reads as "today" too.
 */
interface DayEvents {
  timed: CalendarEvent[];
  allDay: CalendarEvent[];
}

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

    const { timed, allDay } = await this.todaysEvents(room, now, settings.timezone);
    // A full-day reservation owns the room whatever else is in the calendar.
    let current: CalendarEvent | null =
      allDay[0] ??
      timed.find((e) => toDate(e.start) <= now && toDate(e.end) > now) ??
      null;
    const next = timed.find((e) => toDate(e.start) > now) ?? null;

    let checkIn: RoomStatus['checkIn'] = null;
    let releasedEventId: string | null = null;
    // Nobody is expected to "show up" for a day-long block, so it is never
    // asked about and never auto-released.
    if (current && !current.isAllDay && settings.checkInEnabled) {
      const result = await this.resolveCheckIn(room, current, now, settings, opts);
      if (result.released) {
        releasedEventId = current.id;
        current = null;
      } else {
        checkIn = result.status;
      }
    }

    const busyUntil = current ? busyBlockEnd(current, timed) : null;
    const freeUntil = current ? null : next ? toDate(next.start) : dayEnd;
    const availableMinutes = current
      ? 0
      : Math.max(
          0,
          Math.min(
            settings.maxBookingMinutes ?? Infinity,
            differenceInMinutes(freeUntil!, now),
          ),
        );

    // How much longer the running meeting could run before it would collide
    // with the next one (or run past the end of the day), capped like any
    // other booking made here. Zero when another meeting starts the moment
    // this one ends, which is what hides "Extend reservation" on the tablet.
    const extendableMinutes =
      current && !current.isAllDay
        ? Math.max(
            0,
            Math.min(
              settings.maxBookingMinutes ?? Infinity,
              differenceInMinutes(
                next ? toDate(next.start) : dayEnd,
                toDate(current.end),
              ),
            ),
          )
        : 0;

    // Still free, but not for long enough to matter: the screen says so, and
    // offers the people the next meeting belongs to a way to check in early.
    const busySoon =
      !current && next !== null && toDate(next.start).getTime() - now.getTime() <= BUSY_SOON_MS;
    const upcomingConfirmed =
      busySoon && settings.checkInEnabled
        ? await this.isConfirmed(room.id, next!.id)
        : false;

    const state: RoomStatus['state'] = !current
      ? busySoon
        ? 'busy-soon'
        : 'free'
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
      upcomingConfirmed,
      availableMinutes,
      extendableMinutes,
      events: [...allDay, ...timed].filter(
        (e) => toDate(e.end) > now && e.id !== releasedEventId,
      ),
      settings: {
        checkInEnabled: settings.checkInEnabled,
        checkInMinutes: settings.checkInMinutes,
        pollIntervalSeconds: settings.pollIntervalSeconds,
        maxBookingMinutes: settings.maxBookingMinutes,
        timezone: settings.timezone,
      },
    };
  }

  /** Every event today (including finished ones) for the "Today" page. */
  async getDay(roomId: string): Promise<RoomDay> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const { dayStart, dayEnd } = this.dayBounds(now, settings.timezone);
    const { timed, allDay } = await this.todaysEvents(room, now, settings.timezone);
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
      events: timed,
      allDay,
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
    // A walk-in starts at the exact second the tap landed, but every surface —
    // the tablet, the calendar — prints times to the minute. An end on a ragged
    // second makes the room screen contradict itself for up to a minute ("12:58,
    // busy, free at 12:58"), so it is floored to the minute the clock shows. The
    // meeting still runs its full length from the minute the tap fell in.
    const end = startOfMinute(addMinutes(start, dto.durationMinutes));

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

    const { timed, allDay } = await this.todaysEvents(room, now, settings.timezone);
    if (allDay.length > 0) {
      throw new ConflictException(
        `The room is reserved all day for "${allDay[0].title}"`,
      );
    }
    const clash = timed.find((e) => toDate(e.start) < end && toDate(e.end) > start);
    if (clash) {
      throw new ConflictException(`Overlaps "${clash.title}"`);
    }
  }

  /**
   * "Extend reservation": pushes the running meeting's end back by `minutes`.
   *
   * The room can only give away time it still has, so the extension has to fit
   * in the gap before the next meeting and within the configured maximum —
   * `extendableMinutes`, which is what the tablet offers as slots. It is
   * re-checked here because that gap may have been taken while the screen was
   * showing it.
   *
   * Whoever is standing at the tablet asking for more time is plainly in the
   * room, so this also answers the presence prompt, the way a walk-in booking
   * does.
   */
  async extendMeeting(
    roomId: string,
    eventId: string,
    minutes: number,
  ): Promise<RoomStatus> {
    const status = await this.getStatus(roomId, { fromDevice: true });
    const current = status.current;
    if (!current || current.id !== eventId) {
      throw new ConflictException('That meeting is not running right now');
    }
    if (current.isAllDay) {
      throw new ConflictException('A full-day reservation cannot be extended');
    }
    if (minutes > status.extendableMinutes) {
      throw new ConflictException(
        status.extendableMinutes > 0
          ? `This meeting can only be extended by ${status.extendableMinutes} minutes`
          : 'Another meeting starts right after this one',
      );
    }

    const end = startOfMinute(addMinutes(toDate(current.end), minutes));
    // Never as a decline: on a calendar the room may not edit, "free the room"
    // is not an acceptable stand-in for "hold it longer".
    await this.calendar.updateEventEnd(status.room.calendarId, current.id, end, {
      declineIfForbidden: false,
    });
    await this.upsertCheckIn(roomId, current, { confirmedAt: new Date() });
    this.changes.notify(status.room.calendarId);
    this.logger.log(
      `Extended "${current.title}" in ${status.room.name} by ${minutes} min`,
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

  /**
   * "I'm already here" — presence confirmed for a meeting that has not started
   * yet. It then opens as busy instead of asking "is this meeting taking
   * place?", so a room people are already sitting in can never be released out
   * from under them while they wait for it to begin.
   */
  async confirmUpcoming(roomId: string, eventId: string): Promise<RoomStatus> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const { timed } = await this.todaysEvents(room, now, settings.timezone);
    const event = timed.find((e) => e.id === eventId);
    if (!event) throw new BadRequestException("Event not found in today's calendar");
    const startsIn = toDate(event.start).getTime() - now.getTime();
    // The meeting started between the tap and this request: it is the running
    // meeting's own prompt that is being answered, so answer that one.
    if (startsIn <= 0) return this.confirmPresence(roomId, eventId);
    if (startsIn > BUSY_SOON_MS) {
      throw new ConflictException('That meeting is not starting yet');
    }
    await this.upsertCheckIn(roomId, event, { confirmedAt: now });
    this.changes.notify(room.calendarId);
    this.logger.log(`Checked in early for "${event.title}" in ${room.name}`);
    return this.getStatus(roomId, { fromDevice: true });
  }

  /**
   * Takes back an early "I'm already here" — tapped by mistake, or the people
   * who said it have left again. The record is dropped rather than marked
   * unconfirmed, so the meeting starts exactly as it would have: with the
   * normal presence prompt, on the normal deadline.
   *
   * The delete is pinned to the version the row had when it was read, because
   * this is the one presence write that destroys another's: a status poll that
   * crosses the meeting's start opens the real prompt on the same row, and a
   * blind delete would drop it. Pinned, the loser changes nothing and the
   * tablet is told to look again.
   */
  async cancelUpcoming(roomId: string, eventId: string): Promise<RoomStatus> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const now = new Date();
    const { timed } = await this.todaysEvents(room, now, settings.timezone);
    const event = timed.find((e) => e.id === eventId);
    if (!event) throw new BadRequestException("Event not found in today's calendar");
    if (toDate(event.start) <= now) {
      throw new ConflictException('That meeting has already started');
    }

    const record = await this.checkIns.findOne({ where: { roomId, eventId } });
    // Already gone, or never confirmed in the first place: the screen is a poll
    // behind, and the status it gets back is the answer.
    if (!record?.confirmedAt || record.releasedAt) {
      return this.getStatus(roomId, { fromDevice: true });
    }

    const { affected } = await this.checkIns.delete({
      roomId,
      eventId,
      version: record.version,
    });
    if (!affected) {
      throw new ConflictException('This check-in has just changed; try again');
    }
    this.logger.log(`Early check-in cancelled for "${event.title}" in ${room.name}`);
    return this.getStatus(roomId, { fromDevice: true });
  }

  /** "No, nobody showed up" — same effect as the timeout. */
  async release(roomId: string, eventId: string): Promise<RoomStatus> {
    const { room, event } = await this.findRunningEvent(roomId, eventId);
    await this.releaseEvent(room, event, new Date());
    return this.getStatus(roomId, { fromDevice: true });
  }

  /**
   * Deletes one of today's meetings. Reached from the PIN-protected settings
   * screen, so unlike "Free up the room" it is not limited to the meeting in
   * progress. On a Google resource calendar the room may only be able to
   * decline a meeting it does not own; that frees the room just the same.
   */
  async removeEvent(roomId: string, eventId: string): Promise<RoomDay> {
    const room = await this.rooms.findOne(roomId);
    const settings = await this.settings.get();
    const { timed, allDay } = await this.todaysEvents(
      room,
      new Date(),
      settings.timezone,
    );
    const event = [...allDay, ...timed].find((e) => e.id === eventId);
    if (!event) throw new NotFoundException("Event not found in today's calendar");
    await this.calendar.deleteEvent(room.calendarId, event.id);
    this.changes.notify(room.calendarId);
    this.logger.log(`Removed "${event.title}" from ${room.name} via settings`);
    return this.getDay(roomId);
  }

  /**
   * Releases every pending check-in whose deadline passed. Called by the cron
   * job, which logs the number returned — so it counts records this actually
   * released, read back from the record itself. Asking whether the room ended
   * up without a current meeting instead would count a room that is simply
   * free, every minute, for as long as one stale record sits in the table.
   */
  async releaseExpired(): Promise<number> {
    const rooms = await this.rooms.findAll();
    const settings = await this.settings.get();
    const notBefore = subMinutes(
      new Date(),
      settings.checkInMinutes + RELEASE_GRACE_MINUTES,
    );
    let released = 0;
    for (const room of rooms) {
      try {
        const pending = await this.pendingCheckIn(room.id, notBefore);
        if (!pending) continue;
        // Reading the status is what releases it: an expired prompt on a
        // meeting that is still running frees the room as a side effect.
        await this.getStatus(room.id, { fromDevice: false });
        const after = await this.checkIns.findOne({ where: { id: pending.id } });
        if (after?.releasedAt) released += 1;
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
    const { timed, allDay } = await this.todaysEvents(room, now, settings.timezone);
    const event = [...allDay, ...timed].find((e) => e.id === eventId);
    if (!event) throw new BadRequestException("Event not found in today's calendar");
    if (event.isAllDay) {
      throw new ConflictException(
        'A full-day reservation cannot be ended from the tablet',
      );
    }
    if (toDate(event.start) > now || toDate(event.end) <= now) {
      throw new ConflictException('Event is not running right now');
    }
    return { room, event };
  }

  private async todaysEvents(
    room: Pick<Room, 'calendarId'>,
    now: Date,
    timezone: string,
  ): Promise<DayEvents> {
    const { dayStart, dayEnd } = this.dayBounds(now, timezone);
    const events = await this.calendar.listEvents(room.calendarId, dayStart, dayEnd);
    const byStart = (a: CalendarEvent, b: CalendarEvent) =>
      toDate(a.start).getTime() - toDate(b.start).getTime();
    const coversDay = (e: CalendarEvent) =>
      e.isAllDay || (toDate(e.start) <= dayStart && toDate(e.end) >= dayEnd);
    return {
      timed: events.filter((e) => !coversDay(e)).sort(byStart),
      allDay: events
        .filter(
          (e) => coversDay(e) && toDate(e.start) < dayEnd && toDate(e.end) > dayStart,
        )
        .map((e) => ({
          ...e,
          isAllDay: true,
          start: maxDate(toDate(e.start), dayStart).toISOString(),
          end: minDate(toDate(e.end), dayEnd).toISOString(),
        }))
        .sort(byStart),
    };
  }

  private dayBounds(now: Date, timezone: string): { dayStart: Date; dayEnd: Date } {
    const zoned = toZonedTime(now, timezone);
    return {
      dayStart: fromZonedTime(startOfDay(zoned), timezone),
      dayEnd: fromZonedTime(endOfDay(zoned), timezone),
    };
  }

  /** True when presence for `eventId` has already been confirmed and not undone. */
  private async isConfirmed(roomId: string, eventId: string): Promise<boolean> {
    const record = await this.checkIns.findOne({ where: { roomId, eventId } });
    return Boolean(record?.confirmedAt && !record.releasedAt);
  }

  /**
   * An unanswered presence prompt that a release could still act on: one whose
   * meeting began recently enough to plausibly still be running (see
   * {@link RELEASE_GRACE_MINUTES}).
   */
  private async pendingCheckIn(roomId: string, notBefore: Date): Promise<CheckIn | null> {
    return this.checkIns
      .createQueryBuilder('c')
      .where('c.roomId = :roomId', { roomId })
      .andWhere('c.confirmedAt IS NULL')
      .andWhere('c.releasedAt IS NULL')
      .andWhere('c.eventStartsAt > :notBefore', { notBefore })
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

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/** Postgres unique-violation (SQLSTATE 23505) — a concurrent insert won. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (e?.driverError?.code ?? e?.code) === '23505';
}
