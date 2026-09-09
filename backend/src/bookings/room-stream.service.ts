import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, finalize } from 'rxjs';
import { appConfig } from '../config/app-config';
import { BookingsService } from './bookings.service';
import { RoomStatus } from './room-status';

/**
 * Pushes room status to connected tablets instead of making them poll.
 *
 * A single timer re-reads the calendar of every room that currently has a
 * listener and emits only when the status actually changed, so an event added
 * in Google Calendar reaches the screen within one watch interval rather than
 * one (much longer) tablet poll. Rooms nobody is watching cost nothing, and the
 * number of Google calls no longer grows with the number of tablets.
 *
 * The tablet keeps its own slow poll as a safety net (see RoomStore), so a
 * dropped stream degrades to the previous behaviour rather than freezing.
 */
@Injectable()
export class RoomStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomStreamService.name);
  private readonly rooms = new Map<string, Subject<RoomStatus>>();
  /** Last payload sent per room, used to suppress unchanged ticks. */
  private readonly lastSent = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly bookings: BookingsService) {}

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
        if (this.rooms.size === 0) this.clearTimer();
      }),
    );
  }

  onModuleDestroy(): void {
    this.clearTimer();
    for (const subject of this.rooms.values()) subject.complete();
    this.rooms.clear();
  }

  private ensureTimer(): void {
    if (this.timer) return;
    const seconds = appConfig().watchIntervalSeconds;
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.logger.log(`Watching room calendars every ${seconds}s`);
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
      await Promise.all([...this.rooms.keys()].map((id) => this.pushRoom(id)));
    } finally {
      this.ticking = false;
    }
  }

  private async pushRoom(roomId: string): Promise<void> {
    const subject = this.rooms.get(roomId);
    if (!subject) return;
    try {
      // fromDevice: a tablet is connected, so presence prompts may start —
      // this replaces the poll that used to make the same call.
      const status = await this.bookings.getStatus(roomId, { fromDevice: true });
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
