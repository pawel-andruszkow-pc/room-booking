import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '@/lib/api';
import type {
  CalendarProviderInfo,
  CalendarSummary,
  ConnectionTestResult,
  Device,
  PublicSettings,
  Room,
} from '@/types';

/**
 * Data behind the admin and settings pages. Loaded on demand, never polled.
 * Edits and deletes are optimistic: the list updates immediately, the server
 * response replaces the local guess, and a failure restores the previous list.
 */
export class AdminStore {
  rooms: Room[] = [];
  devices: Device[] = [];
  settings: PublicSettings | null = null;
  provider: CalendarProviderInfo | null = null;
  calendars: CalendarSummary[] = [];
  loading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get activeRooms(): Room[] {
    return this.rooms.filter((r) => r.isActive);
  }

  /** Rooms only (no PIN needed) — used by the device settings page. */
  async loadRooms() {
    const rooms = await api.rooms.list(false);
    runInAction(() => {
      this.rooms = rooms;
    });
  }

  /** Everything the admin page shows. Requires the admin PIN to be unlocked. */
  async loadAll() {
    this.loading = true;
    this.error = null;
    try {
      const [rooms, devices, settings, provider] = await Promise.all([
        api.rooms.list(true),
        api.devices.list(),
        api.settings.get(),
        api.calendar.provider(),
      ]);
      runInAction(() => {
        this.rooms = rooms;
        this.devices = devices;
        this.settings = settings;
        this.provider = provider;
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

  async loadCalendars() {
    const calendars = await api.calendar.calendars();
    runInAction(() => {
      this.calendars = calendars;
    });
  }

  /** Subscribes the backend to a shared calendar and shows it in the list. */
  async addCalendar(calendarId: string) {
    const calendar = await api.calendar.addCalendar(calendarId);
    runInAction(() => {
      this.calendars = [...this.calendars.filter((c) => c.id !== calendar.id), calendar].sort(
        (a, b) => a.summary.localeCompare(b.summary),
      );
    });
    return calendar;
  }

  /** Creation needs the server-generated id, so it is not optimistic. */
  async createRoom(body: Partial<Room>) {
    const room = await api.rooms.create(body);
    runInAction(() => {
      this.rooms = sortRooms([...this.rooms, room]);
    });
    return room;
  }

  async updateRoom(id: string, body: Partial<Room>) {
    const previous = this.rooms;
    runInAction(() => {
      this.rooms = sortRooms(this.rooms.map((r) => (r.id === id ? { ...r, ...body } : r)));
    });
    try {
      const room = await api.rooms.update(id, body);
      runInAction(() => {
        this.rooms = sortRooms(this.rooms.map((r) => (r.id === id ? room : r)));
      });
      return room;
    } catch (err) {
      runInAction(() => {
        this.rooms = previous;
      });
      throw err;
    }
  }

  async deleteRoom(id: string) {
    const previousRooms = this.rooms;
    const previousDevices = this.devices;
    runInAction(() => {
      this.rooms = this.rooms.filter((r) => r.id !== id);
      this.devices = this.devices.map((d) =>
        d.roomId === id ? { ...d, roomId: null, room: null } : d,
      );
    });
    try {
      await api.rooms.remove(id);
    } catch (err) {
      runInAction(() => {
        this.rooms = previousRooms;
        this.devices = previousDevices;
      });
      throw err;
    }
  }

  testCalendar(calendarId: string): Promise<ConnectionTestResult> {
    return api.calendar.test(calendarId);
  }

  async updateDevice(id: string, body: { name?: string; roomId?: string | null; isKiosk?: boolean }) {
    const previous = this.devices;
    runInAction(() => {
      this.devices = this.devices.map((d) => {
        if (d.id !== id) return d;
        const room =
          body.roomId === undefined
            ? d.room
            : (this.rooms.find((r) => r.id === body.roomId) ?? null);
        return { ...d, ...body, room };
      });
    });
    try {
      const device = await api.devices.update(id, body);
      runInAction(() => {
        this.devices = this.devices.map((d) => (d.id === id ? device : d));
      });
    } catch (err) {
      runInAction(() => {
        this.devices = previous;
      });
      throw err;
    }
  }

  async deleteDevice(id: string) {
    const previous = this.devices;
    runInAction(() => {
      this.devices = this.devices.filter((d) => d.id !== id);
    });
    try {
      await api.devices.remove(id);
    } catch (err) {
      runInAction(() => {
        this.devices = previous;
      });
      throw err;
    }
  }

  async updateSettings(patch: Partial<PublicSettings> & { settingsPin?: string; adminPin?: string }) {
    const previous = this.settings;
    if (previous) {
      // PINs are write-only; never mirror them into the visible settings.
      const visible: Partial<PublicSettings> = { ...patch };
      delete (visible as { settingsPin?: string }).settingsPin;
      delete (visible as { adminPin?: string }).adminPin;
      runInAction(() => {
        this.settings = { ...previous, ...visible };
      });
    }
    try {
      const settings = await api.settings.update(patch);
      runInAction(() => {
        this.settings = settings;
      });
      return settings;
    } catch (err) {
      runInAction(() => {
        this.settings = previous;
      });
      throw err;
    }
  }

  async createLocalEvent(body: {
    calendarId: string;
    title: string;
    start: string;
    end: string;
    isAllDay?: boolean;
  }) {
    return api.calendar.createLocalEvent(body);
  }
}

function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => a.name.localeCompare(b.name));
}
