import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '@/lib/api';
import { storage, uuid } from '@/lib/utils';
import type { Device, Room } from '@/types';

const DEVICE_ID_KEY = 'rb.deviceId';

/**
 * Identity of this browser/tablet. The id is minted once and kept in
 * localStorage; the backend stores which room the device shows and whether it
 * is a kiosk tablet.
 */
export class DeviceStore {
  readonly deviceId: string;
  device: Device | null = null;
  loading = false;
  error: string | null = null;
  /** Fullscreen/wake-lock state, toggled by useKiosk(). */
  fullscreen = false;

  constructor() {
    let id = storage.get(DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      storage.set(DEVICE_ID_KEY, id);
    }
    this.deviceId = id;
    makeAutoObservable(this, { deviceId: false }, { autoBind: true });
  }

  get roomId(): string | null {
    return this.device?.roomId ?? null;
  }

  get isKiosk(): boolean {
    return this.device?.isKiosk ?? false;
  }

  get isAssigned(): boolean {
    return Boolean(this.device?.roomId);
  }

  async register(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const device = await api.devices.register(this.deviceId, navigator.userAgent);
      runInAction(() => {
        this.device = device;
      });
    } catch (err) {
      runInAction(() => {
        this.error = (err as Error).message;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * Optimistic: the room screen switches to the new room immediately (pass
   * `rooms` so the relation can be filled in); the server response replaces the
   * guess and a failure restores the previous assignment.
   */
  async update(
    patch: { name?: string; roomId?: string | null; isKiosk?: boolean },
    rooms: Room[] = [],
  ) {
    const previous = this.device;
    if (previous) {
      runInAction(() => {
        this.device = {
          ...previous,
          ...patch,
          room:
            patch.roomId === undefined
              ? previous.room
              : (rooms.find((r) => r.id === patch.roomId) ?? null),
        };
      });
    }
    try {
      const device = await api.devices.update(this.deviceId, patch);
      runInAction(() => {
        this.device = device;
      });
      return device;
    } catch (err) {
      runInAction(() => {
        this.device = previous;
      });
      throw err;
    }
  }

  setFullscreen(value: boolean) {
    this.fullscreen = value;
  }
}
