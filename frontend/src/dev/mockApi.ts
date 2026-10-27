/**
 * Dev-only stand-in for the backend, for looking at the room screen in a given
 * state without a calendar, a database or a meeting that happens to be on.
 *
 * Open the dev server with `?mock` (busy room) or `?mock=<scenario>`; the
 * choice sticks for the browser tab, `?mock=off` turns it off again. Every
 * `/api` request is answered here from a few events kept in memory, so taps on
 * the screen (free up, extend, check in, book) work and reloading resets them.
 * Nothing leaves the browser.
 *
 * Only on localhost: the dev server also listens on the LAN (`host: true`) so
 * real tablets can use it, and none of them should ever end up on fake data.
 *
 * Scenarios: `busy` (default), `check-in`, `soon`, `free`, `all-day`.
 *
 * `?template=<season>` (with `?mock`) dresses the busy screen for that season
 * whatever the date, and names the room and meetings to match:
 * `valentines`, `womens-day`, `april-fools`, `halloween`, `santa`, `christmas`.
 * It sticks for the tab too; `?template=off` goes back to the calendar.
 */
import type {
  CalendarEvent,
  Device,
  PublicSettings,
  Room,
  RoomDay,
  RoomState,
  RoomStatus,
} from '@/types';
import { forceSeason, isSeason, type Season } from '@/lib/season';

const SESSION_KEY = 'rb.mock';
const TEMPLATE_KEY = 'rb.mock.template';
const MINUTE = 60_000;
const BUSY_SOON_MS = 5 * MINUTE;
const BACK_TO_BACK_TOLERANCE_MS = MINUTE;

type Scenario = 'busy' | 'check-in' | 'soon' | 'free' | 'all-day';
const SCENARIOS: Scenario[] = ['busy', 'check-in', 'soon', 'free', 'all-day'];

/** Loopback addresses only — a tablet on the LAN reaches the dev server by IP. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Reads `?mock` into sessionStorage and returns the active scenario, if any. */
function resolveScenario(): Scenario | null {
  if (!LOCAL_HOSTS.has(window.location.hostname)) return null;
  const param = new URLSearchParams(window.location.search).get('mock');
  try {
    if (param === 'off') sessionStorage.removeItem(SESSION_KEY);
    else if (param !== null) {
      sessionStorage.setItem(SESSION_KEY, SCENARIOS.includes(param as Scenario) ? param : 'busy');
    }
    return (sessionStorage.getItem(SESSION_KEY) as Scenario | null) ?? null;
  } catch {
    return param && param !== 'off' ? 'busy' : null;
  }
}

/** Reads `?template` into sessionStorage and returns the season to force, if any. */
function resolveTemplate(): Season | null {
  const param = new URLSearchParams(window.location.search).get('template');
  try {
    if (param === 'off') sessionStorage.removeItem(TEMPLATE_KEY);
    else if (isSeason(param)) sessionStorage.setItem(TEMPLATE_KEY, param);
    const stored = sessionStorage.getItem(TEMPLATE_KEY);
    return isSeason(stored) ? stored : null;
  } catch {
    return isSeason(param) ? param : null;
  }
}

/** Room and meeting names: the current meeting, a later one, an all-day one. */
type Names = { room: string; meetings: [string, string]; allDay: string };

const PLAIN: Names = {
  room: 'Library',
  meetings: ['Design sync', 'Sprint retro'],
  allDay: 'Team offsite',
};

const TEMPLATE_NAMES: Record<Season, Names> = {
  valentines: {
    room: 'Rose Garden',
    meetings: ['Love letters sync', 'Cupid targeting review'],
    allDay: 'Card-making workshop',
  },
  'womens-day': {
    room: 'Tulip Room',
    meetings: ['Flower delivery sync', 'Women in tech panel'],
    allDay: "Women's Day celebration",
  },
  'april-fools': {
    room: 'Whoopee Room',
    meetings: ['Totally serious meeting', 'Prank post-mortem'],
    allDay: 'Rubber duck debugging day',
  },
  halloween: {
    room: 'Haunted Library',
    meetings: ['Pumpkin carving sync', 'Witching hour retro'],
    allDay: 'Haunted house build',
  },
  santa: {
    room: 'Reindeer Stables',
    meetings: ['Gift list review', 'Chimney logistics'],
    allDay: "Santa's workshop day",
  },
  christmas: {
    room: 'Fireplace Lounge',
    meetings: ['Christmas party planning', 'Secret Santa draw'],
    allDay: 'Tree decorating',
  },
};

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

const settings: PublicSettings = {
  checkInEnabled: true,
  checkInMinutes: 10,
  timezone,
  pollIntervalSeconds: 20,
  maxBookingMinutes: null,
  calendarProvider: 'local',
  googleServiceAccountEmail: null,
};

const room: Room = {
  id: 'mock-room',
  name: PLAIN.room,
  calendarId: 'mock-calendar',
  location: '6th floor',
  capacity: 6,
  isActive: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function event(
  id: string,
  title: string,
  start: number,
  end: number,
  isAllDay = false,
): CalendarEvent {
  return {
    id,
    title,
    description: null,
    organizer: 'mock@example.com',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    isAllDay,
    source: 'local',
    htmlLink: null,
  };
}

function dayBounds(at: number): { start: number; end: number } {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

/** In-memory calendar: what the backend would read from Google. */
class MockCalendar {
  events: CalendarEvent[] = [];
  /** Meetings someone said "we're here" for (on the day or ahead of it). */
  confirmed = new Set<string>();
  private seq = 0;

  constructor(scenario: Scenario, names: Names) {
    const [first, later] = names.meetings;
    const now = Date.now() - (Date.now() % MINUTE);
    const add = (title: string, fromMin: number, toMin: number, confirmed = true) => {
      const e = event(`mock-${++this.seq}`, title, now + fromMin * MINUTE, now + toMin * MINUTE);
      this.events.push(e);
      if (confirmed) this.confirmed.add(e.id);
    };
    switch (scenario) {
      case 'busy':
        add(first, -20, 40);
        add(later, 90, 120);
        break;
      case 'check-in':
        add(first, -1, 45, false);
        break;
      case 'soon':
        add(first, 4, 60, false);
        break;
      case 'free':
        add(first, 60, 120, false);
        break;
      case 'all-day': {
        const { start, end } = dayBounds(now);
        this.events.push(event('mock-all-day', names.allDay, start, end, true));
        break;
      }
    }
  }

  newId(): string {
    return `mock-${++this.seq}`;
  }

  /** Same derivation as BookingsService.getStatus, minus the database. */
  status(): RoomStatus {
    const at = Date.now();
    const { end: dayEnd } = dayBounds(at);
    const startsAt = (e: CalendarEvent) => new Date(e.start).getTime();
    const endsAt = (e: CalendarEvent) => new Date(e.end).getTime();

    // An unanswered prompt past its deadline frees the room, as the backend does.
    for (const e of this.events) {
      const deadline = startsAt(e) + settings.checkInMinutes * MINUTE;
      if (!e.isAllDay && startsAt(e) <= at && at > deadline && !this.confirmed.has(e.id)) {
        e.end = new Date(at).toISOString();
      }
    }
    this.events = this.events
      .filter((e) => endsAt(e) > at)
      .sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || startsAt(a) - startsAt(b));

    const allDay = this.events.filter((e) => e.isAllDay);
    const timed = this.events.filter((e) => !e.isAllDay);
    const current = allDay[0] ?? timed.find((e) => startsAt(e) <= at && endsAt(e) > at) ?? null;
    const next = timed.find((e) => startsAt(e) > at) ?? null;

    let busyUntil: number | null = null;
    if (current) {
      busyUntil = endsAt(current);
      for (const e of timed) {
        if (startsAt(e) > busyUntil + BACK_TO_BACK_TOLERANCE_MS) break;
        if (endsAt(e) > busyUntil) busyUntil = endsAt(e);
      }
    }

    const checkIn =
      current && !current.isAllDay
        ? {
            pending: !this.confirmed.has(current.id),
            confirmed: this.confirmed.has(current.id),
            deadline: new Date(startsAt(current) + settings.checkInMinutes * MINUTE).toISOString(),
          }
        : null;

    const state: RoomState = current
      ? checkIn?.pending
        ? 'awaiting-check-in'
        : 'busy'
      : next && startsAt(next) - at <= BUSY_SOON_MS
        ? 'busy-soon'
        : 'free';

    const freeUntil = current ? null : next ? next.start : new Date(dayEnd).toISOString();
    const extendTo = next ? startsAt(next) : dayEnd;

    return {
      room,
      now: new Date(at).toISOString(),
      state,
      current,
      next,
      busyUntil: busyUntil === null ? null : new Date(busyUntil).toISOString(),
      checkIn,
      freeUntil,
      upcomingConfirmed: state === 'busy-soon' && next !== null && this.confirmed.has(next.id),
      availableMinutes: current ? 0 : Math.floor((new Date(freeUntil!).getTime() - at) / MINUTE),
      extendableMinutes:
        current && !current.isAllDay
          ? Math.max(0, Math.floor((extendTo - endsAt(current)) / MINUTE))
          : 0,
      events: this.events,
      settings: {
        checkInEnabled: settings.checkInEnabled,
        checkInMinutes: settings.checkInMinutes,
        pollIntervalSeconds: settings.pollIntervalSeconds,
        maxBookingMinutes: settings.maxBookingMinutes,
        timezone,
      },
    };
  }

  today(): RoomDay {
    const at = Date.now();
    const { start, end } = dayBounds(at);
    return {
      room,
      now: new Date(at).toISOString(),
      dayStart: new Date(start).toISOString(),
      dayEnd: new Date(end).toISOString(),
      timezone,
      events: this.events.filter((e) => !e.isAllDay),
      allDay: this.events.filter((e) => e.isAllDay),
    };
  }

  find(id: string): CalendarEvent {
    const e = this.events.find((x) => x.id === id);
    if (!e) throw new MockError(404, 'Event not found');
    return e;
  }
}

class MockError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An SSE response that stays open (and silent) until the request is aborted. */
function silentStream(signal?: AbortSignal | null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () =>
        controller.error(new DOMException('Aborted', 'AbortError')),
      );
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

function route(
  calendar: MockCalendar,
  method: string,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal | null,
): Response {
  const device: Device = {
    id: 'mock-device',
    name: 'Mock tablet',
    roomId: room.id,
    room,
    isKiosk: false,
    userAgent: navigator.userAgent,
    lastSeenAt: new Date().toISOString(),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };

  if (path === '/auth/me') return json({ user: 'mock', calendarProvider: 'local' });
  if (path === '/auth/pin') return json({ ok: true, scope: body.scope });
  if (path === '/settings') return json(settings);
  if (path === '/devices') return json([device]);
  if (path.startsWith('/devices')) return json(device);
  if (path === '/rooms') return json([room]);
  if (path === `/rooms/${room.id}`) return json(room);

  const prefix = `/rooms/${room.id}/`;
  if (!path.startsWith(prefix)) throw new MockError(404, `Not mocked: ${method} ${path}`);
  const action = path.slice(prefix.length);
  const now = Date.now();

  switch (action) {
    case 'status':
      return json(calendar.status());
    case 'stream':
      return silentStream(signal);
    case 'today':
      return json(calendar.today());
    case 'book': {
      const start = body.startsAt ? new Date(body.startsAt as string).getTime() : now;
      const endMs = start + Number(body.durationMinutes) * MINUTE;
      const e = event(
        calendar.newId(),
        (body.title as string) || 'Walk-in meeting',
        start,
        endMs - (endMs % MINUTE),
      );
      calendar.events.push(e);
      // A walk-in is booked by someone standing in the room.
      if (!body.startsAt) calendar.confirmed.add(e.id);
      return json(calendar.status());
    }
    case 'extend': {
      const e = calendar.find(body.eventId as string);
      e.end = new Date(new Date(e.end).getTime() + Number(body.minutes) * MINUTE).toISOString();
      return json(calendar.status());
    }
    case 'end':
    case 'release':
      calendar.find(body.eventId as string).end = new Date(now).toISOString();
      return json(calendar.status());
    case 'check-in':
    case 'check-in-early':
      calendar.confirmed.add(body.eventId as string);
      return json(calendar.status());
    case 'check-in-early/cancel':
      calendar.confirmed.delete(body.eventId as string);
      return json(calendar.status());
  }

  if (action.startsWith('events/') && method === 'DELETE') {
    const id = decodeURIComponent(action.slice('events/'.length));
    calendar.events = calendar.events.filter((e) => e.id !== id);
    return json(calendar.today());
  }
  throw new MockError(404, `Not mocked: ${method} ${path}`);
}

/**
 * Patches `fetch` so `/api` calls never reach the network. A no-op unless the
 * tab was opened with `?mock`. Must run before the stores make their first
 * request.
 */
export function installMockApi(): void {
  const scenario = resolveScenario();
  if (!scenario) return;

  const template = resolveTemplate();
  if (template) forceSeason(template);
  const names = template ? TEMPLATE_NAMES[template] : PLAIN;
  room.name = names.room;
  const calendar = new MockCalendar(scenario, names);
  const realFetch = window.fetch.bind(window);

  // The app only asks for a status once it holds credentials; any will do here.
  try {
    if (!localStorage.getItem('rb.credentials')) {
      localStorage.setItem('rb.credentials', `Basic ${btoa('mock:mock')}`);
    }
  } catch {
    /* ignore */
  }

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), window.location.href);
    const at = url.pathname.indexOf('/api/');
    if (at === -1) return realFetch(input, init);

    const method = init?.method ?? request?.method ?? 'GET';
    const path = url.pathname.slice(at + '/api'.length).replace(/\/+$/, '');
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    // A little latency, so optimistic updates and spinners behave as they do live.
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return route(calendar, method, path, body, init?.signal);
    } catch (err) {
      const status = err instanceof MockError ? err.status : 500;
      return json({ message: (err as Error).message }, status);
    }
  };

  console.info(
    `[mock] /api is mocked in this tab (scenario: ${scenario}, template: ${template ?? 'none'}). ?mock=off to stop.`,
  );
}
