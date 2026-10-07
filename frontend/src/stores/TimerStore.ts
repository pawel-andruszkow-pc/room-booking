import { makeAutoObservable, reaction } from 'mobx';
import { keepOutputAwake, playChime, unlockAudio } from '@/lib/chime';
import type { ClockStore } from './ClockStore';

const STORAGE_KEY = 'timer';

/** How long a finished timer keeps ringing before it gives up (ms). */
const RING_MS = 30_000;
/** Pause between two rings (ms). */
const RING_EVERY_MS = 1_500;
/** A finished timer nobody dismisses clears itself when the ring stops (ms). */
const LINGER_MS = RING_MS;
/** How long before the end the audio output is woken up (ms); see `keepOutputAwake`. */
const PRIME_MS = 5_000;

/**
 * One countdown timer for the tablet — a kitchen timer for the room, nothing
 * to do with the calendar. It is set from the timer page, shown on the room
 * screen while it runs, and rings there when it ends.
 *
 * The end is a point in time, not a `setTimeout`: the remaining time is
 * re-derived on every tick of {@link ClockStore}, so a tablet that was busy or
 * asleep for a moment still rings at the right time rather than late. The
 * timer is also kept in local storage, so a reload mid-countdown picks it up
 * again.
 *
 * It counts on the tablet's own clock, not the server-corrected one the room
 * screen shows. The correction is learned from status responses and can move
 * by seconds at a time; a timer on that clock would jump with it, and one
 * saved under one correction and restored under another would be off by the
 * difference. A timer has no business with the server's time at all.
 */
export class TimerStore {
  /** When the timer ends (ms, `Date.now()` scale); null when none is set. */
  endsAt: number | null = null;
  /** The length it was set to, in minutes. */
  minutes = 0;
  /** True from the moment it rings until someone dismisses it. */
  finished = false;

  private ringTimer: number | null = null;
  private ringStarted = 0;

  constructor(private readonly clock: ClockStore) {
    makeAutoObservable<this, 'clock' | 'ringTimer' | 'ringStarted'>(
      this,
      { clock: false, ringTimer: false, ringStarted: false },
      { autoBind: true },
    );
    this.restore();

    reaction(
      () => this.due,
      (due) => {
        if (due) this.finish();
      },
    );
    reaction(
      () => this.active && this.untilEndMs <= PRIME_MS,
      (soon) => {
        if (soon) keepOutputAwake(true);
      },
    );
    reaction(
      () => this.finished && this.sinceEndMs >= LINGER_MS,
      (stale) => {
        if (stale) this.cancel();
      },
    );

    // A restored timer has had no tap to unlock audio with; the first tap on
    // anything while one is set does it, so the ring is not silent.
    document.addEventListener(
      'pointerdown',
      () => {
        if (this.endsAt !== null) unlockAudio();
      },
      { capture: true, passive: true },
    );
  }

  /** A timer is counting down. */
  get active(): boolean {
    return this.endsAt !== null && !this.finished;
  }

  /**
   * The tablet's clock as of the last tick: the app clock with the server
   * correction taken back out. Reading it through the clock store is what
   * makes everything below recompute once a second.
   */
  private get wallNow(): number {
    return this.clock.now.getTime() - this.clock.offsetMs;
  }

  /** Signed: negative once the end has passed. */
  private get untilEndMs(): number {
    return this.endsAt === null ? 0 : this.endsAt - this.wallNow;
  }

  /** The timer has run out. Judged from half a tick before the end, see `start`. */
  private get due(): boolean {
    return this.active && this.untilEndMs <= 500;
  }

  /**
   * Whole seconds left. The end sits on a whole second and the ticks land a
   * few milliseconds after each one, so the raw figure is always a hair under
   * a whole number; rounding to the nearest reads it right every time. (Rounding
   * up did not: the same few milliseconds of jitter either side of the boundary
   * made the display skip a second now and then.)
   */
  get secondsLeft(): number {
    return Math.max(0, Math.round(this.untilEndMs / 1000));
  }

  private get sinceEndMs(): number {
    return -this.untilEndMs;
  }

  /** Starts (or restarts) the timer for `minutes` from now. */
  start(minutes: number) {
    // This runs on the tap: the one moment the browser lets the page unlock audio.
    unlockAudio();
    this.stopRinging();
    this.minutes = minutes;
    // On a whole second: the ticks are aligned to them too, so every tick
    // sees a whole number of seconds left and the last one lands on the end.
    this.endsAt = Math.round(Date.now() / 1000) * 1000 + minutes * 60_000;
    this.finished = false;
    this.persist();
  }

  /** Stops a running timer, or dismisses a finished one. */
  cancel() {
    this.stopRinging();
    this.endsAt = null;
    this.finished = false;
    this.persist();
  }

  private finish() {
    this.finished = true;
    this.persist();
    this.ring();
  }

  /** Chimes every few seconds until dismissed, or until it has rung long enough. */
  private ring() {
    this.clearRing();
    // Normally awake already (see PRIME_MS); not after a reload in the last seconds.
    keepOutputAwake(true);
    this.ringStarted = Date.now();
    const beat = () => {
      if (Date.now() - this.ringStarted >= RING_MS) {
        this.stopRinging();
        return;
      }
      playChime();
    };
    beat();
    this.ringTimer = window.setInterval(beat, RING_EVERY_MS);
  }

  private stopRinging() {
    this.clearRing();
    keepOutputAwake(false);
  }

  private clearRing() {
    if (this.ringTimer !== null) window.clearInterval(this.ringTimer);
    this.ringTimer = null;
  }

  private persist() {
    try {
      if (this.endsAt === null) localStorage.removeItem(STORAGE_KEY);
      else
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ endsAt: this.endsAt, minutes: this.minutes, finished: this.finished }),
        );
    } catch {
      /* Storage unavailable: the timer still runs, it just does not survive a reload. */
    }
  }

  /** Picks up a timer that was running before a reload. A finished one is dropped. */
  private restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { endsAt?: number; minutes?: number; finished?: boolean };
      if (
        typeof saved.endsAt !== 'number' ||
        typeof saved.minutes !== 'number' ||
        saved.finished ||
        saved.endsAt <= Date.now()
      ) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      this.endsAt = saved.endsAt;
      this.minutes = saved.minutes;
    } catch {
      /* Unreadable: start without one. */
    }
  }
}
