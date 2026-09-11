import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '@/lib/api';
import type { RoomDay } from '@/types';

/** How often the day is re-fetched in the background. */
const POLL_MS = 120_000;

/**
 * Today's meetings for the assigned room, kept in memory for the whole
 * session so the Today page opens on data instead of a spinner.
 *
 * The cache is refreshed every two minutes while the app runs, whenever the
 * page is opened, whenever the tablet comes back to the foreground, and (via
 * `RootStore`) whenever the room's status changes — a booking made on this
 * tablet shows up on the day view without waiting for the next poll.
 */
export class DayStore {
  day: RoomDay | null = null;
  /** Last fetch error; only worth showing when there is nothing cached. */
  error: string | null = null;

  private roomId: string | null = null;
  private timer: number | null = null;
  private abort: AbortController | null = null;
  private disposers: Array<() => void> = [];

  constructor() {
    makeAutoObservable<this, 'roomId' | 'timer' | 'abort' | 'disposers'>(
      this,
      { roomId: false, timer: false, abort: false, disposers: false },
      { autoBind: true },
    );
  }

  start(roomId: string) {
    if (this.roomId === roomId) return;
    this.stop();
    this.roomId = roomId;
    // A different room's day must never show under this room's name.
    this.day = null;
    this.error = null;
    void this.refresh();

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
    this.clearTimer();
    this.abort?.abort();
    this.abort = null;
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.roomId = null;
  }

  /** True once the cached day is over: the next fetch brings tomorrow. */
  isStale(now: Date): boolean {
    return this.day !== null && now.getTime() >= new Date(this.day.dayEnd).getTime();
  }

  /**
   * Fetches in the background; the cached day stays on screen until the new
   * one arrives, and the poll timer restarts from this fetch.
   */
  async refresh(): Promise<void> {
    if (!this.roomId) return;
    this.abort?.abort();
    this.clearTimer();
    const controller = new AbortController();
    this.abort = controller;
    const roomId = this.roomId;
    try {
      const day = await api.rooms.today(roomId, controller.signal);
      if (controller.signal.aborted || this.roomId !== roomId) return;
      runInAction(() => {
        this.day = day;
        this.error = null;
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      runInAction(() => {
        this.error = (err as Error).message;
      });
    } finally {
      if (this.abort === controller) this.abort = null;
      if (this.roomId === roomId) this.schedule();
    }
  }

  private schedule() {
    this.clearTimer();
    this.timer = window.setTimeout(() => void this.refresh(), POLL_MS);
  }

  private clearTimer() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
