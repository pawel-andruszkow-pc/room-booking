import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { api } from '@/lib/api';
import { minutesBetween } from '@/lib/time';
import type { CalendarEvent, RoomState, RoomStatus } from '@/types';
import type { ClockStore } from './ClockStore';

/**
 * Live status of the room this device displays. Polls the backend at the
 * server-configured interval, re-fetches immediately at event boundaries
 * (meeting starts / ends, check-in deadline) and after every user action.
 *
 * User actions are **optimistic**: the predicted status is applied to the UI
 * the moment the button is tapped, the server response then replaces it, and
 * a failure rolls back to the previous status. A version counter makes sure a
 * poll that was already in flight when the action started can never overwrite
 * the optimistic (or the confirmed) state with stale data.
 */
export class RoomStore {
  roomId: string | null = null;
  status: RoomStatus | null = null;
  loading = false;
  /** True while a user action is waiting for the server (prevents double taps). */
  busy = false;
  /** True while the shown status is a local prediction not yet confirmed. */
  optimistic = false;
  error: string | null = null;
  lastUpdated: Date | null = null;

  private pollTimer: number | null = null;
  private abort: AbortController | null = null;
  private disposers: Array<() => void> = [];
  /** Bumped on every mutation; responses from an older version are discarded. */
  private version = 0;
  /** Ids of events booked from this device (predicted and confirmed). */
  private ownBookings = new Set<string>();

  constructor(private readonly clock: ClockStore) {
    makeAutoObservable<
      this,
      'pollTimer' | 'abort' | 'disposers' | 'clock' | 'version' | 'ownBookings'
    >(
      this,
      {
        pollTimer: false,
        abort: false,
        disposers: false,
        clock: false,
        version: false,
        ownBookings: false,
      },
      { autoBind: true },
    );
  }

  /** True when `eventId` is a walk-in booking made on this tablet. */
  isOwnBooking(eventId: string): boolean {
    return this.ownBookings.has(eventId);
  }

  // --- derived ---------------------------------------------------------------

  get state(): RoomState {
    return this.status?.state ?? 'free';
  }

  get current(): CalendarEvent | null {
    return this.status?.current ?? null;
  }

  get next(): CalendarEvent | null {
    return this.status?.next ?? null;
  }

  get timezone(): string {
    return this.status?.settings.timezone ?? 'Europe/Warsaw';
  }

  /** Minutes until the next meeting (minute granularity → cheap re-renders). */
  get minutesUntilNext(): number | null {
    void this.clock.minute;
    if (!this.next) return null;
    return minutesBetween(this.clock.now, this.next.start);
  }

  get minutesUntilCurrentEnds(): number | null {
    void this.clock.minute;
    if (!this.current) return null;
    return minutesBetween(this.clock.now, this.current.end);
  }

  /** Seconds left to confirm presence, or null when no prompt is pending. */
  get checkInSecondsLeft(): number | null {
    const checkIn = this.status?.checkIn;
    if (!checkIn?.pending) return null;
    const left = (new Date(checkIn.deadline).getTime() - this.clock.now.getTime()) / 1000;
    return Math.max(0, Math.floor(left));
  }

  /** Longest booking possible right now, shrinking as the clock runs. */
  get availableMinutes(): number {
    void this.clock.minute;
    if (!this.status || this.status.current) return 0;
    if (!this.status.freeUntil) return this.status.availableMinutes;
    const live = minutesBetween(this.clock.now, this.status.freeUntil);
    return Math.max(0, Math.min(this.status.settings.maxBookingMinutes, live));
  }

  /** The next moment the status is guaranteed to change. */
  private get nextBoundary(): number | null {
    if (!this.status) return null;
    const candidates: number[] = [];
    if (this.status.current) candidates.push(new Date(this.status.current.end).getTime());
    if (this.status.next) candidates.push(new Date(this.status.next.start).getTime());
    if (this.status.checkIn?.pending) candidates.push(new Date(this.status.checkIn.deadline).getTime());
    return candidates.length ? Math.min(...candidates) : null;
  }

  // --- lifecycle -------------------------------------------------------------

  start(roomId: string) {
    if (this.roomId === roomId && this.pollTimer !== null) return;
    this.stop();
    this.roomId = roomId;
    this.status = null;
    this.error = null;
    void this.refresh();

    // Refresh the instant a meeting starts/ends or a deadline passes.
    this.disposers.push(
      reaction(
        () => {
          const boundary = this.nextBoundary;
          return boundary !== null && this.clock.now.getTime() >= boundary + 500;
        },
        (crossed) => {
          if (crossed) void this.refresh();
        },
      ),
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    this.disposers.push(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    });
  }

  stop() {
    this.clearPoll();
    this.abort?.abort();
    this.abort = null;
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.roomId = null;
  }

  async refresh(): Promise<void> {
    if (!this.roomId) return;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const roomId = this.roomId;
    const version = this.version;
    this.loading = this.status === null;
    try {
      const status = await api.rooms.status(roomId, controller.signal);
      if (controller.signal.aborted || this.roomId !== roomId) return;
      // A mutation happened meanwhile: this snapshot predates it, drop it.
      if (version !== this.version) return;
      this.applyStatus(status);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      runInAction(() => {
        this.error = (err as Error).message;
        this.loading = false;
      });
    } finally {
      if (this.abort === controller) this.abort = null;
      if (version === this.version) this.schedulePoll();
    }
  }

  // --- actions (all optimistic) ---------------------------------------------

  async book(durationMinutes: number, title?: string): Promise<void> {
    await this.mutate(
      (s) => {
        const predicted = predictBooked(s, this.clock.now, durationMinutes, title);
        if (predicted.current) this.ownBookings.add(predicted.current.id);
        return predicted;
      },
      async (id) => {
        const status = await api.rooms.book(id, durationMinutes, title);
        if (status.current) this.ownBookings.add(status.current.id);
        return status;
      },
    );
  }

  async endMeeting(): Promise<void> {
    const eventId = this.current?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => predictFreed(s, this.clock.now),
      (id) => api.rooms.end(id, eventId),
    );
  }

  async confirmPresence(): Promise<void> {
    const eventId = this.current?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => predictConfirmed(s),
      (id) => api.rooms.checkIn(id, eventId),
    );
  }

  async release(): Promise<void> {
    const eventId = this.current?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => predictFreed(s, this.clock.now),
      (id) => api.rooms.release(id, eventId),
    );
  }

  // --- internals -------------------------------------------------------------

  /**
   * Applies `predict(status)` right away, sends the request, then replaces the
   * prediction with the server's answer. On failure the previous status is
   * restored and the error re-thrown so the caller can show it.
   */
  private async mutate(
    predict: (status: RoomStatus) => RoomStatus,
    send: (roomId: string) => Promise<RoomStatus>,
  ): Promise<void> {
    if (!this.roomId || this.busy) return;
    const roomId = this.roomId;
    const snapshot = this.status;

    // Invalidate any poll in flight and stop the timer: the prediction must
    // not be clobbered by a response describing the world before the tap.
    this.version += 1;
    const version = this.version;
    this.abort?.abort();
    this.clearPoll();

    runInAction(() => {
      this.busy = true;
      if (snapshot) {
        this.status = predict(snapshot);
        this.optimistic = true;
      }
    });

    try {
      const status = await send(roomId);
      if (this.roomId !== roomId || version !== this.version) return;
      this.applyStatus(status);
    } catch (err) {
      if (this.roomId === roomId && version === this.version) {
        runInAction(() => {
          this.status = snapshot;
          this.optimistic = false;
        });
        // The prediction was wrong; fetch the truth right away.
        void this.refresh();
      }
      throw err;
    } finally {
      runInAction(() => {
        this.busy = false;
      });
      if (version === this.version) this.schedulePoll();
    }
  }

  private applyStatus(status: RoomStatus) {
    runInAction(() => {
      this.status = status;
      this.optimistic = false;
      this.error = null;
      this.loading = false;
      this.lastUpdated = new Date();
    });
    this.clock.syncWith(status.now);
  }

  private schedulePoll() {
    this.clearPoll();
    if (!this.roomId) return;
    const seconds = this.status?.settings.pollIntervalSeconds ?? 20;
    this.pollTimer = window.setTimeout(() => void this.refresh(), seconds * 1000);
  }

  private clearPoll() {
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }
}

// --- optimistic predictions --------------------------------------------------
// Pure functions from the current status to the status we expect the server
// to return. They only need to be right about what the UI shows next; the real
// response replaces them within a round-trip.

function predictBooked(
  s: RoomStatus,
  now: Date,
  durationMinutes: number,
  title?: string,
): RoomStatus {
  const start = now.toISOString();
  const end = new Date(now.getTime() + durationMinutes * 60000).toISOString();
  const event: CalendarEvent = {
    id: `optimistic-${now.getTime()}`,
    title: title?.trim() || 'Walk-in meeting',
    description: null,
    organizer: null,
    start,
    end,
    isAllDay: false,
    source: s.events[0]?.source ?? 'local',
    htmlLink: null,
  };
  return {
    ...s,
    now: start,
    state: 'busy',
    current: event,
    checkIn: s.settings.checkInEnabled
      ? { pending: false, confirmed: true, deadline: end }
      : null,
    freeUntil: null,
    availableMinutes: 0,
    events: [event, ...s.events],
  };
}

function predictFreed(s: RoomStatus, now: Date): RoomStatus {
  const currentId = s.current?.id;
  const events = s.events.filter((e) => e.id !== currentId);
  const next = s.next ?? events.find((e) => new Date(e.start) > now) ?? null;
  const availableMinutes = next
    ? Math.max(0, Math.min(s.settings.maxBookingMinutes, minutesBetween(now, next.start)))
    : s.settings.maxBookingMinutes;
  return {
    ...s,
    now: now.toISOString(),
    state: 'free',
    current: null,
    next,
    checkIn: null,
    // End of day is unknown here; the server response fills it in.
    freeUntil: next ? next.start : null,
    availableMinutes,
    events,
  };
}

function predictConfirmed(s: RoomStatus): RoomStatus {
  return {
    ...s,
    state: 'busy',
    checkIn: s.checkIn ? { ...s.checkIn, pending: false, confirmed: true } : null,
  };
}
