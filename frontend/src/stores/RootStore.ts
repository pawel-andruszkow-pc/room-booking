import { configureHttp } from '@/lib/http';
import { AdminStore } from './AdminStore';
import { AuthStore } from './AuthStore';
import { ClockStore } from './ClockStore';
import { DeviceStore } from './DeviceStore';
import { RoomStore } from './RoomStore';
import { ToastStore } from './ToastStore';

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
  readonly admin = new AdminStore();
  readonly toast = new ToastStore();

  constructor() {
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
  }

  /** Runs once at app start: validate credentials, then register the device. */
  async bootstrap() {
    await this.auth.restore();
    if (this.auth.isAuthenticated) await this.device.register();
  }
}
