import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { api } from '@/lib/api';
import { MIN_EXTEND_MINUTES } from '@/lib/booking';
import { minutesBetween, minutesUntil } from '@/lib/time';
import type { CalendarEvent, RoomState, RoomStatus } from '@/types';
import type { ClockStore } from './ClockStore';

/**
 * Live status of the room this device displays. Polls the backend at the
 * server-configured interval, re-fetches immediately at event boundaries
 * (meeting starts / ends, check-in deadline) and after every user action.
 *
 * The screen does not wait for those re-fetches to turn over: every status
 * carries the room's remaining events, so the tablet re-derives the state from
 * them as the clock crosses a boundary (see `projectStatus`). A meeting that
 * starts at 10:00 shows as busy at 10:00, not a round-trip later.
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
  /**
   * True when the current status came from a tap on this tablet (prediction or
   * its confirmation) rather than from the clock / calendar. The page skips the
   * state-change animation in that case: the person already knows what happened.
   */
  changedByUser = false;

  private pollTimer: number | null = null;
  /** The action currently on the wire; the next one waits for it. */
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  /** Aborts the SSE subscription when the room changes or the store stops. */
  private streamAbort: AbortController | null = null;
  private disposers: Array<() => void> = [];
  /** Bumped on every mutation; responses from an older version are discarded. */
  private version = 0;
  /** Ids of events booked from this device (predicted and confirmed). */
  private ownBookings = new Set<string>();

  constructor(private readonly clock: ClockStore) {
    makeAutoObservable<
      this,
      | 'pollTimer'
      | 'abort'
      | 'streamAbort'
      | 'disposers'
      | 'clock'
      | 'version'
      | 'ownBookings'
      | 'pending'
    >(
      this,
      {
        pending: false,
        pollTimer: false,
        abort: false,
        streamAbort: false,
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
    return minutesUntil(this.clock.now, this.next.start);
  }

  get minutesUntilCurrentEnds(): number | null {
    void this.clock.minute;
    if (!this.current) return null;
    return minutesUntil(this.clock.now, this.current.end);
  }

  /** When the room is really free again: end of the whole back-to-back block. */
  get busyUntil(): string | null {
    return this.status?.busyUntil ?? this.current?.end ?? null;
  }

  get minutesUntilFree(): number | null {
    void this.clock.minute;
    const until = this.busyUntil;
    if (!until) return null;
    return minutesUntil(this.clock.now, until);
  }

  /** True once "I'm already here" has been answered for the meeting about to start. */
  get upcomingConfirmed(): boolean {
    return this.status?.upcomingConfirmed ?? false;
  }

  /**
   * How much longer the running meeting may run: the gap before the next one,
   * capped by the longest booking this room allows. Unlike `availableMinutes`
   * it does not shrink with the clock — the gap it measures starts at the end
   * of the meeting, not now.
   */
  get extendableMinutes(): number {
    return this.status?.extendableMinutes ?? 0;
  }

  /**
   * Whether "Extend reservation" is worth offering: a timed meeting is running
   * and at least the shortest slot still fits before the next one.
   */
  get canExtend(): boolean {
    return (
      this.state === 'busy' && !this.isAllDay && this.extendableMinutes >= MIN_EXTEND_MINUTES
    );
  }

  /** True while the room is taken by a full-day reservation. */
  get isAllDay(): boolean {
    return this.current?.isAllDay ?? false;
  }

  /** The meeting that starts right after the current one, when there is no gap. */
  get followingMeeting(): CalendarEvent | null {
    const current = this.current;
    const next = this.next;
    if (!current || !next || !this.status?.busyUntil) return null;
    return this.status.busyUntil !== current.end ? next : null;
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
    return Math.max(0, Math.min(this.status.settings.maxBookingMinutes ?? Infinity, live));
  }

  /** The next moment the status is guaranteed to change. */
  private get nextBoundary(): number | null {
    if (!this.status) return null;
    const candidates: number[] = [];
    if (this.status.current) candidates.push(new Date(this.status.current.end).getTime());
    if (this.status.next) candidates.push(new Date(this.status.next.start).getTime());
    // "Free" turns into "Busy soon" before the meeting itself starts. Only
    // while still free: once the screen says so, the start is the next
    // boundary, and a candidate already behind us would pin the reaction.
    if (this.status.state === 'free' && this.status.next)
      candidates.push(new Date(this.status.next.start).getTime() - BUSY_SOON_MS);
    if (this.status.checkIn?.pending)
      candidates.push(new Date(this.status.checkIn.deadline).getTime());
    return candidates.length ? Math.min(...candidates) : null;
  }

  // --- lifecycle -------------------------------------------------------------

  start(roomId: string) {
    // `roomId` is set synchronously below, so this also covers a second call
    // that arrives while the first refresh is still in flight — React
    // StrictMode invokes mount effects twice, and the old guard additionally
    // required pollTimer, which refresh() only sets once it has responded.
    // That restarted the store and aborted the request already on the wire.
    if (this.roomId === roomId) return;
    this.stop();
    this.roomId = roomId;
    this.status = null;
    this.error = null;
    void this.refresh();
    this.openStream(roomId);

    // The instant a meeting starts/ends or a deadline passes: turn the screen
    // over from the events already on hand, then ask the server to confirm it.
    this.disposers.push(
      reaction(
        () => {
          const boundary = this.nextBoundary;
          return boundary !== null && this.clock.now.getTime() >= boundary;
        },
        (crossed) => {
          if (!crossed) return;
          this.project();
          void this.refresh();
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
    this.streamAbort?.abort();
    this.streamAbort = null;
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

  /**
   * Books a slot later today. Unlike a walk-in there is nothing to predict —
   * the room stays free until that time comes — so this one simply applies the
   * status the server returns.
   */
  async reserve(startsAt: Date, durationMinutes: number, title?: string): Promise<void> {
    await this.mutate(
      (s) => s,
      (id) => api.rooms.reserve(id, startsAt.toISOString(), durationMinutes, title),
    );
  }

  /**
   * "Extend reservation": the meeting in the room runs `minutes` longer. The
   * screen shows the later end straight away — the gap it runs into was
   * already known to be free, so the server rarely disagrees.
   */
  async extendMeeting(minutes: number): Promise<void> {
    const eventId = this.current?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => predictExtended(s, minutes),
      (id) => api.rooms.extend(id, eventId, minutes),
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

  /**
   * "I'm already here": confirms presence for the meeting that is about to
   * start, so it opens as busy instead of asking. Nothing about the room
   * changes yet, only the answer it will not have to ask for.
   */
  async confirmUpcoming(): Promise<void> {
    const eventId = this.next?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => ({ ...s, upcomingConfirmed: true }),
      (id) => api.rooms.checkInEarly(id, eventId),
    );
  }

  /** Takes back an early check-in: the meeting is asked about as usual. */
  async cancelUpcoming(): Promise<void> {
    const eventId = this.next?.id;
    if (!eventId) return;
    await this.mutate(
      (s) => ({ ...s, upcomingConfirmed: false }),
      (id) => api.rooms.cancelCheckInEarly(id, eventId),
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
    // A second action while one is in flight (free the room, then book it
    // again within the round trip) queues behind it instead of being dropped.
    while (this.pending) await this.pending.catch(() => undefined);
    if (!this.roomId) return;
    const run = this.runMutation(predict, send);
    this.pending = run;
    try {
      await run;
    } finally {
      if (this.pending === run) this.pending = null;
    }
  }

  private async runMutation(
    predict: (status: RoomStatus) => RoomStatus,
    send: (roomId: string) => Promise<RoomStatus>,
  ): Promise<void> {
    if (!this.roomId) return;
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
        this.changedByUser = true;
      }
    });

    try {
      const status = await send(roomId);
      if (this.roomId !== roomId || version !== this.version) return;
      this.applyStatus(status, 'user');
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

  /**
   * Moves the shown status on to what the clock alone already implies. Called
   * at every boundary, so the state word changes with the minute rather than
   * with the network.
   */
  private project(): void {
    const status = this.status;
    // A tap is in flight: its own prediction is on screen and its response is
    // the truth, so there is nothing to reason about here.
    if (!status || this.optimistic) return;
    const projected = projectStatus(status, this.clock.now);
    if (projected === status) return;
    runInAction(() => {
      this.status = projected;
      // The clock moved this, not the person in front of the tablet, so the
      // free/busy change gets its animation.
      this.changedByUser = false;
    });
  }

  private applyStatus(status: RoomStatus, source: 'user' | 'remote' = 'remote') {
    // Sync first so the projection below reasons with the corrected clock.
    this.clock.syncWith(status.now);
    runInAction(() => {
      // A response describes the room as it was when the server read the
      // calendar. If a boundary has passed since (a slow round-trip, or a
      // tablet clock running ahead of the server's), carry it forward rather
      // than letting a stale snapshot flip the screen back for a second.
      this.status = projectStatus(status, this.clock.now);
      this.optimistic = false;
      this.changedByUser = source === 'user';
      this.error = null;
      this.loading = false;
      this.lastUpdated = new Date();
    });
  }

  private schedulePoll() {
    this.clearPoll();
    if (!this.roomId) return;
    const seconds = this.status?.settings.pollIntervalSeconds ?? 20;
    this.pollTimer = window.setTimeout(() => void this.refresh(), seconds * 1000);
  }

  /**
   * Subscribes to the backend's push stream so a calendar change shows within
   * seconds. The poll below stays as a fallback: if the stream drops (proxy
   * timeout, sleeping tablet) the screen keeps updating at the slower rate
   * while the stream reconnects on its own.
   */
  private openStream(roomId: string) {
    const controller = new AbortController();
    this.streamAbort = controller;
    api.rooms.streamStatus(roomId, {
      signal: controller.signal,
      onMessage: (status) => {
        if (controller.signal.aborted || this.roomId !== roomId) return;
        // A mutation is in flight; its own refresh carries the truth.
        if (this.optimistic) return;
        this.applyStatus(status);
        // Pushed data is fresh, so the fallback poll can wait a full interval.
        this.schedulePoll();
      },
    });
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

/** Meetings starting this close to the previous end count as back-to-back. */
const BACK_TO_BACK_TOLERANCE_MS = 60_000;

/** Mirrors BUSY_SOON_MS in the backend's BookingsService — keep the two equal. */
const BUSY_SOON_MS = 5 * 60_000;

/** The free-side state: "busy soon" once the next meeting is minutes away. */
function freeState(next: CalendarEvent | null, at: number): RoomState {
  if (!next) return 'free';
  return new Date(next.start).getTime() - at <= BUSY_SOON_MS ? 'busy-soon' : 'free';
}

/**
 * Re-derives the status from the events it already carries, as of `at`.
 *
 * The backend owns the state, but it only works it out when asked, so between
 * a meeting's start and the answer to the refresh that start triggered the
 * screen would still read "Free". Every status ships the room's remaining
 * events, which is all `BookingsService.getStatus` reasons over too, so the
 * tablet can reach the same conclusion on its own the second the clock crosses
 * the boundary — and the server confirms it a round-trip later.
 *
 * Two things it cannot know are left to the backend: the end of the calendar
 * day (only needed when nothing is booked after the current meeting), and the
 * check-in records — an expired presence prompt is the server's to resolve,
 * because releasing the room also shortens the event in the calendar.
 *
 * Returns `s` unchanged when nothing has moved, so it is safe to call often.
 */
function projectStatus(s: RoomStatus, now: Date): RoomStatus {
  // Never reason about a moment before the server read the calendar: the
  // tablet's clock may sit behind it, within ClockStore's sync tolerance.
  const at = Math.max(now.getTime(), new Date(s.now).getTime());
  const startsAt = (e: CalendarEvent) => new Date(e.start).getTime();
  const endsAt = (e: CalendarEvent) => new Date(e.end).getTime();

  // Anything that has ended drops out, exactly as the server's list does. The
  // status keeps the day's full-day reservations ahead of the timed meetings,
  // and filtering preserves that order.
  const events = s.events.filter((e) => endsAt(e) > at);
  const allDay = events.filter((e) => e.isAllDay);
  const timed = events.filter((e) => !e.isAllDay);

  // A full-day reservation owns the room whatever else is in the calendar, and
  // only timed meetings are ever "next" (see BookingsService.getStatus).
  const current =
    allDay[0] ?? timed.find((e) => startsAt(e) <= at && endsAt(e) > at) ?? null;
  const next = timed.find((e) => startsAt(e) > at) ?? null;
  // Nothing has moved — not the state, and not the day's remaining events,
  // which the booking screen lays the time picker out from. "Busy soon" is the
  // one change the events alone do not show: the same meeting is still next,
  // it has only come close enough to take the screen over.
  const same = (a: CalendarEvent | null, b: CalendarEvent | null) =>
    (a?.id ?? null) === (b?.id ?? null);
  if (
    events.length === s.events.length &&
    same(current, s.current) &&
    same(next, s.next) &&
    (current !== null || freeState(next, at) === s.state)
  ) {
    return s;
  }

  let busyUntil: number | null = null;
  if (current) {
    // End of the chain of meetings that follow each other without a gap.
    busyUntil = endsAt(current);
    for (const event of timed) {
      if (startsAt(event) > busyUntil + BACK_TO_BACK_TOLERANCE_MS) break;
      if (endsAt(event) > busyUntil) busyUntil = endsAt(event);
    }
  }

  const checkIn = projectCheckIn(s, current, at);
  const extendableMinutes = projectExtendable(s, current, next);
  const state: RoomState = !current
    ? freeState(next, at)
    : checkIn?.pending
      ? 'awaiting-check-in'
      : 'busy';

  // With no meeting left today the day's end is unknown here; `predictFreed`
  // makes the same call, and the server response fills it in.
  const freeUntil = current ? null : next ? next.start : s.current ? null : s.freeUntil;
  const cap = s.settings.maxBookingMinutes;
  const availableMinutes = current
    ? 0
    : freeUntil
      ? Math.max(0, Math.min(cap ?? Infinity, minutesBetween(new Date(at), freeUntil)))
      : (cap ?? 24 * 60);

  return {
    ...s,
    now: new Date(at).toISOString(),
    state,
    current,
    next,
    busyUntil: busyUntil === null ? null : new Date(busyUntil).toISOString(),
    checkIn,
    freeUntil,
    // An early check-in belongs to one meeting; it means nothing once the
    // screen is counting down to a different one.
    upcomingConfirmed: s.upcomingConfirmed && next?.id === s.next?.id,
    availableMinutes,
    extendableMinutes,
    events,
  };
}

/**
 * How much longer the running meeting could run, worked out from the events on
 * hand. The end of the calendar day is the one bound the tablet does not know
 * (see `projectStatus`), so with nothing booked after the meeting this keeps
 * the figure the server sent — and for a meeting that has only just started,
 * where there is none, it falls back to the booking cap until the refresh that
 * follows every projection fills it in.
 */
function projectExtendable(
  s: RoomStatus,
  current: CalendarEvent | null,
  next: CalendarEvent | null,
): number {
  if (!current || current.isAllDay) return 0;
  const cap = s.settings.maxBookingMinutes ?? Infinity;
  if (next) {
    return Math.max(0, Math.min(cap, minutesBetween(new Date(current.end), next.start)));
  }
  if (current.id === s.current?.id) return s.extendableMinutes;
  return Number.isFinite(cap) ? cap : 0;
}

/**
 * The prompt for a meeting that has just started. The server keeps the record
 * (and the answer the room gave), so its version is kept for the meeting that
 * was already running; a newly started one gets the prompt the backend is
 * about to open — or none, when the tablet has already missed the deadline,
 * which the backend reads as "nobody was here to ask, assume it is on".
 */
function projectCheckIn(s: RoomStatus, current: CalendarEvent | null, at: number) {
  // Nobody is expected to "show up" for a day-long block, so it is never asked
  // about — the backend skips the prompt for it too.
  if (!current || current.isAllDay) return null;
  if (current.id === s.current?.id) return s.checkIn;
  if (!s.settings.checkInEnabled) return null;
  const deadline = new Date(current.start).getTime() + s.settings.checkInMinutes * 60_000;
  // Answered before it started ("I'm already here"), so it opens as busy. The
  // backend agrees; without this the screen would flash the prompt for the
  // round-trip it takes to say so.
  if (s.upcomingConfirmed && current.id === s.next?.id) {
    return { pending: false, confirmed: true, deadline: new Date(deadline).toISOString() };
  }
  return {
    pending: at <= deadline,
    confirmed: at > deadline,
    deadline: new Date(deadline).toISOString(),
  };
}

function predictBooked(
  s: RoomStatus,
  now: Date,
  durationMinutes: number,
  title?: string,
): RoomStatus {
  const start = now.toISOString();
  // Floored to the minute, like the event the backend is about to create, so
  // the prediction and its confirmation print the same "free at" time.
  const endMs = now.getTime() + durationMinutes * 60000;
  const end = new Date(endMs - (endMs % 60000)).toISOString();
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
    // Walk-ins are capped at the gap before the next meeting, so no chaining.
    busyUntil: end,
    checkIn: s.settings.checkInEnabled ? { pending: false, confirmed: true, deadline: end } : null,
    freeUntil: null,
    upcomingConfirmed: false,
    availableMinutes: 0,
    extendableMinutes: projectExtendable(s, event, s.next),
    events: [event, ...s.events],
  };
}

/**
 * "Extend reservation": the running meeting ends later. The gap it grows into
 * was free a moment ago, so the screen shows the new end right away — and the
 * room keeps the rest of that gap available to extend into again.
 */
function predictExtended(s: RoomStatus, minutes: number): RoomStatus {
  const current = s.current;
  if (!current) return s;
  const end = new Date(new Date(current.end).getTime() + minutes * 60_000).toISOString();
  const extended = { ...current, end };
  return {
    ...s,
    current: extended,
    // Only the meeting's own end moves; a block that runs past it (which is
    // why it would not have been extendable) keeps its later end.
    busyUntil:
      s.busyUntil && new Date(s.busyUntil) > new Date(end) ? s.busyUntil : end,
    extendableMinutes: Math.max(0, s.extendableMinutes - minutes),
    events: s.events.map((e) => (e.id === current.id ? extended : e)),
  };
}

function predictFreed(s: RoomStatus, now: Date): RoomStatus {
  const currentId = s.current?.id;
  const events = s.events.filter((e) => e.id !== currentId);
  const next = s.next ?? events.find((e) => new Date(e.start) > now) ?? null;
  // Without a next meeting the server bounds this by the end of the day; the
  // guess is generous and its refresh replaces it within a second.
  const availableMinutes = next
    ? Math.max(
        0,
        Math.min(s.settings.maxBookingMinutes ?? Infinity, minutesBetween(now, next.start)),
      )
    : (s.settings.maxBookingMinutes ?? 24 * 60);
  return {
    ...s,
    now: now.toISOString(),
    state: freeState(next, now.getTime()),
    current: null,
    next,
    busyUntil: null,
    checkIn: null,
    // End of day is unknown here; the server response fills it in.
    freeUntil: next ? next.start : null,
    availableMinutes,
    extendableMinutes: 0,
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
