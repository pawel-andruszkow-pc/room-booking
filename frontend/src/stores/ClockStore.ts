import { makeAutoObservable } from 'mobx';

/**
 * One ticking clock for the whole app. Components observe the granularity they
 * need: `now` (every second, for the clock and countdowns) or `minute` (only
 * changes once a minute, for "in 12 min" labels) — so the big room screen does
 * not re-render every second.
 */
export class ClockStore {
  now = new Date();
  /** Server-minus-client offset in ms, learned from status responses. */
  offsetMs = 0;
  private timer: number | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  start() {
    if (this.timer !== null) return;
    this.tick();
    // Align ticks to the wall-clock second so the display never looks jittery.
    const schedule = () => {
      const delay = 1000 - (Date.now() % 1000);
      this.timer = window.setTimeout(() => {
        this.tick();
        schedule();
      }, delay);
    };
    schedule();
  }

  stop() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private tick() {
    this.now = new Date(Date.now() + this.offsetMs);
  }

  /** Re-sync with the server clock (called with the `now` from a status response). */
  syncWith(serverNowIso: string) {
    const serverNow = new Date(serverNowIso).getTime();
    if (Number.isNaN(serverNow)) return;
    const offset = serverNow - Date.now();
    // Ignore sub-second jitter; only correct real drift.
    if (Math.abs(offset - this.offsetMs) > 1500) {
      this.offsetMs = offset;
      this.tick();
    }
  }

  /** Changes once per minute — cheap dependency for minute-level labels. */
  get minute(): number {
    return Math.floor(this.now.getTime() / 60000);
  }
}
