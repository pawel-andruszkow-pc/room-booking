import { session } from './utils';

/** Seasonal dressing for the busy screen. Only one so far. */
export type Season = 'halloween';

const SESSION_KEY = 'rb.theme';

type Override = { theme: 'halloween'; until: number } | { theme: 'none' };

/**
 * Halloween week in `year`: the working week 31 October falls in, from Monday
 * until Halloween is over. On a weekend Halloween the office is empty, so it
 * is the Monday to Friday before it. `end` is the first moment after it.
 */
function halloweenWeek(year: number): { start: number; end: number } {
  // Monday-based day of the week: 0 = Monday … 6 = Sunday.
  const weekday = (new Date(year, 9, 31).getDay() + 6) % 7;
  const monday = 31 - weekday;
  return {
    start: new Date(year, 9, monday).getTime(),
    // The day after Halloween, or Saturday when Halloween is on a weekend.
    end: Math.min(new Date(year, 10, 1).getTime(), new Date(year, 9, monday + 5).getTime()),
  };
}

/** The end of the Halloween week still ahead of (or running at) `date`. */
function halloweenEnd(date: Date): number {
  const { end } = halloweenWeek(date.getFullYear());
  return date.getTime() < end ? end : halloweenWeek(date.getFullYear() + 1).end;
}

/**
 * `?theme=halloween` forces the dressing for the browser tab until Halloween is
 * over, so it can be looked at (or started early) outside its week;
 * `?theme=none` turns it off and `?theme=auto` goes back to the calendar.
 *
 * The parameter is taken out of the address once read. The tablet reloads
 * itself every night (useDailyReload), and with the parameter still in the URL
 * each reload would arm the theme again — past Halloween, into next year.
 */
const override: Override | null = (() => {
  const url = new URL(window.location.href);
  const param = url.searchParams.get('theme');
  if (param !== null) {
    if (param === 'halloween') {
      session.set(
        SESSION_KEY,
        JSON.stringify({ theme: 'halloween', until: halloweenEnd(new Date()) }),
      );
    } else if (param === 'none') session.set(SESSION_KEY, JSON.stringify({ theme: 'none' }));
    else if (param === 'auto') session.remove(SESSION_KEY);
    url.searchParams.delete('theme');
    window.history.replaceState(window.history.state, '', url);
  }
  try {
    const stored = JSON.parse(session.get(SESSION_KEY) ?? 'null') as Override | null;
    return stored?.theme === 'halloween' || stored?.theme === 'none' ? stored : null;
  } catch {
    return null;
  }
})();

/** The season on `date`: Halloween in its working week (see `halloweenWeek`). */
export function seasonOn(date: Date): Season | null {
  if (override?.theme === 'none') return null;
  // A forced Halloween ends with the real one.
  if (override?.theme === 'halloween' && date.getTime() < override.until) return 'halloween';
  const { start, end } = halloweenWeek(date.getFullYear());
  return date.getTime() >= start && date.getTime() < end ? 'halloween' : null;
}
