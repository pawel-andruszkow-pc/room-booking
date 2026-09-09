import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable, Subject, Subscription, finalize } from 'rxjs';
import { CalendarChangesService } from '../calendar/calendar-changes.service';
import { appConfig } from '../config/app-config';
import { BookingsService } from './bookings.service';
import { RoomStatus } from './room-status';

/**
 * Google fires several notifications for one edit (e.g. a recurring series);
 * wait this long after the last one before re-reading the calendar.
 */
const CHANGE_DEBOUNCE_MS = 750;

/**
 * Pushes room status to connected tablets instead of making them poll.
 *
 * Two things trigger a re-read of a room's calendar:
 *  - a change notification on CalendarChangesService — Google push (see
 *    GoogleWatchService) or one of our own bookings — which refreshes the room
 *    within a second;
 *  - a single timer covering every room that currently has a listener. Rooms
 *    with an active push channel are only re-read every
 *    WATCH_PUSH_FALLBACK_SECONDS (push can be delayed or dropped); all others
 *    every WATCH_INTERVAL_SECONDS, which is the local-development path.
 *
 * Either way a status is emitted only when it actually changed, rooms nobody
 * is watching cost nothing, and the number of Google calls no longer grows
 * with the number of tablets. The tablet keeps its own slow poll as a safety
 * net (see RoomStore), so a dropped stream degrades to the previous behaviour
 * rather than freezing.
 */
@Injectable()
export class RoomStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomStreamService.name);
  private readonly rooms = new Map<string, Subject<RoomStatus>>();
  /** Last payload sent per room, used to suppress unchanged ticks. */
  private readonly lastSent = new Map<string, string>();
  /** When each room was last read, so push-covered rooms can skip most ticks. */
  private readonly lastRead = new Map<string, number>();
  /** Calendar id per watched room, learned from the first status read. */
  private readonly calendarByRoom = new Map<string, string>();
  /** Pending debounced refreshes, per calendar. */
  private readonly pendingChanges = new Map<string, NodeJS.Timeout>();
  private changes: Subscription | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly bookings: BookingsService,
    private readonly calendarChanges: CalendarChangesService,
  ) {}

  onModuleInit(): void {
    this.changes = this.calendarChanges.changes$.subscribe((calendarId) =>
      this.scheduleRefresh(calendarId),
    );
  }

  /** One SSE subscriber. The room is watched while at least one is connected. */
  subscribe(roomId: string): Observable<RoomStatus> {
    let subject = this.rooms.get(roomId);
    if (!subject) {
      subject = new Subject<RoomStatus>();
      this.rooms.set(roomId, subject);
    }
    const room = subject;
    this.ensureTimer();

    // Send the current status immediately so a fresh tablet paints at once
    // rather than waiting for the first tick.
    void this.pushRoom(roomId);

    return room.asObservable().pipe(
      finalize(() => {
        if (room.observed) return;
        this.rooms.delete(roomId);
        this.lastSent.delete(roomId);
        this.lastRead.delete(roomId);
        this.calendarByRoom.delete(roomId);
        if (this.rooms.size === 0) this.clearTimer();
      }),
    );
  }

  onModuleDestroy(): void {
    this.changes?.unsubscribe();
    this.changes = null;
    for (const handle of this.pendingChanges.values()) clearTimeout(handle);
    this.pendingChanges.clear();
    this.clearTimer();
    for (const subject of this.rooms.values()) subject.complete();
    this.rooms.clear();
  }

  /** Re-reads every watched room on `calendarId` shortly after the last notification. */
  private scheduleRefresh(calendarId: string): void {
    const roomIds = this.roomsOnCalendar(calendarId);
    if (roomIds.length === 0) return;

    const pending = this.pendingChanges.get(calendarId);
    if (pending) clearTimeout(pending);
    this.pendingChanges.set(
      calendarId,
      setTimeout(() => {
        this.pendingChanges.delete(calendarId);
        // Re-resolve: tablets may have connected or left during the debounce.
        for (const roomId of this.roomsOnCalendar(calendarId)) void this.pushRoom(roomId);
      }, CHANGE_DEBOUNCE_MS),
    );
  }

  private roomsOnCalendar(calendarId: string): string[] {
    const out: string[] = [];
    for (const [roomId, cal] of this.calendarByRoom) {
      if (cal === calendarId && this.rooms.has(roomId)) out.push(roomId);
    }
    return out;
  }

  private ensureTimer(): void {
    if (this.timer) return;
    const { watchIntervalSeconds, watchPushFallbackSeconds } = appConfig();
    this.timer = setInterval(() => void this.tick(), watchIntervalSeconds * 1000);
    this.logger.log(
      `Watching room calendars every ${watchIntervalSeconds}s ` +
        `(${watchPushFallbackSeconds}s for rooms with Google push)`,
    );
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.log('No tablets connected — stopped watching');
  }

  /** Skips a tick while the previous one is still talking to Google. */
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = [...this.rooms.keys()].filter((id) => this.isDue(id));
      await Promise.all(due.map((id) => this.pushRoom(id)));
    } finally {
      this.ticking = false;
    }
  }

  /** Push-covered rooms wait for the (much longer) fallback interval. */
  private isDue(roomId: string): boolean {
    const calendarId = this.calendarByRoom.get(roomId);
    if (!calendarId || !this.calendarChanges.hasPush(calendarId)) return true;
    const last = this.lastRead.get(roomId) ?? 0;
    return Date.now() - last >= appConfig().watchPushFallbackSeconds * 1000;
  }

  private async pushRoom(roomId: string): Promise<void> {
    const subject = this.rooms.get(roomId);
    if (!subject) return;
    try {
      // fromDevice: a tablet is connected, so presence prompts may start —
      // this replaces the poll that used to make the same call.
      const status = await this.bookings.getStatus(roomId, { fromDevice: true });
      this.lastRead.set(roomId, Date.now());
      this.calendarByRoom.set(roomId, status.room.calendarId);
      // `now` ticks every time; compare everything else so an unchanged room
      // stays quiet and the tablet's own clock keeps the time up to date.
      const { now: _now, ...rest } = status;
      const fingerprint = JSON.stringify(rest);
      if (this.lastSent.get(roomId) === fingerprint) return;
      this.lastSent.set(roomId, fingerprint);
      subject.next(status);
    } catch (err) {
      // A failing calendar must not kill the stream; the tablet's fallback poll
      // surfaces the error and the next tick retries.
      this.logger.warn(`Watch failed for room ${roomId}: ${String(err)}`);
    }
  }
}
