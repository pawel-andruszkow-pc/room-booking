import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { configureHttp } from '@/lib/http';
import { AdminStore } from './AdminStore';
import { AuthStore } from './AuthStore';
import { ClockStore } from './ClockStore';
import { DayStore } from './DayStore';
import { DeviceStore } from './DeviceStore';
import { RoomStore } from './RoomStore';
import { ToastStore } from './ToastStore';
import { UpdateStore } from './UpdateStore';

/**
 * Why MobX (and not React context + reducers)?
 * The room screen has a clock ticking every second, a polling loop, countdowns
 * and a handful of admin forms. With MobX each observer component re-renders
 * only when the exact values it read change (the clock digits, not the whole
 * page), which keeps the tablet UI at 60 fps without hand-written memoisation.
 * Context would push every tick through the tree or require splitting state
 * into many providers.
 */
export class RootStore {
  readonly clock = new ClockStore();
  readonly auth = new AuthStore();
  readonly device = new DeviceStore();
  readonly room = new RoomStore(this.clock);
  readonly day = new DayStore();
  readonly admin = new AdminStore();
  readonly toast = new ToastStore();
  readonly update = new UpdateStore();

  /**
   * False until bootstrap() has settled. The app renders a loader until then so
   * a reload goes straight to the room screen instead of flashing through the
   * pages that a half-known auth/device state would otherwise render.
   */
  booted = false;

  constructor() {
    // Only `booted` needs to be reactive; the sub-stores manage their own state.
    makeAutoObservable(
      this,
      {
        clock: false,
        auth: false,
        device: false,
        room: false,
        day: false,
        admin: false,
        toast: false,
        update: false,
      },
      { autoBind: true },
    );

    configureHttp({
      headers: () => ({ ...this.auth.headers, deviceId: this.device.deviceId }),
      onUnauthorized: () => this.auth.handleUnauthorized(),
      // A PIN that was changed on another device is rejected with 403; forget
      // it so the PIN gate asks again instead of every save failing silently.
      onForbidden: (message) => {
        // Only "<scope> PIN required" from the guard means the cached PIN is
        // stale. Other 403s (e.g. "Wrong PIN" from the keypad) are handled by
        // the caller.
        if (/admin pin required/i.test(message)) this.auth.lock('admin');
        else if (/settings pin required/i.test(message)) this.auth.lock('settings');
        else return;
        this.toast.error('PIN required', 'Please unlock this page again.');
      },
    });
    this.clock.start();
    // Tablets run unattended, so a deploy has to reach them on its own.
    this.update.start();

    // Today's meetings are cached for the assigned room from the moment it is
    // known, so the Today page never opens on a spinner.
    reaction(
      () => this.device.roomId,
      (roomId) => (roomId ? this.day.start(roomId) : this.day.stop()),
      { fireImmediately: true },
    );
    // The room screen learns of changes first (stream, own bookings): pull the
    // day view along with it.
    reaction(
      () => {
        const s = this.room.status;
        return [s?.current?.id, s?.current?.end, s?.next?.id, s?.next?.start].join('|');
      },
      () => void this.day.refresh(),
    );
    // Turn the page at midnight.
    reaction(
      () => this.day.isStale(this.clock.now),
      (stale) => {
        if (stale) void this.day.refresh();
      },
    );
  }

  /**
   * Runs once at app start: validate credentials, then register the device.
   *
   * The promise is cached so repeat calls collapse into the first run. React
   * StrictMode invokes mount effects twice in development, which otherwise
   * fires /auth/me and /devices/register twice on every page load; a remount
   * would do the same in production. Signing in registers the device from
   * LoginPage, so nothing needs this to run a second time.
   */
  bootstrap(): Promise<void> {
    this.bootstrapping ??= this.runBootstrap();
    return this.bootstrapping;
  }

  private bootstrapping: Promise<void> | null = null;

  private async runBootstrap(): Promise<void> {
    try {
      await this.auth.restore();
      if (this.auth.isAuthenticated) await this.device.register();
    } finally {
      // Always flip, even when the API is unreachable — both stores record
      // their own failure, and a permanent loader would hide it.
      runInAction(() => {
        this.booted = true;
      });
    }
  }
}
