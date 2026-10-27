import { session } from './utils';

/** Seasonal dressing for the busy screen. */
export type Season =
  'valentines' | 'womens-day' | 'april-fools' | 'easter' | 'halloween' | 'santa' | 'christmas';

const SESSION_KEY = 'rb.theme';

type Override = { theme: Season; until: number } | { theme: 'none' };

/** When a season runs: `start` is its first moment, `end` the first moment after it. */
type Window = { start: number; end: number };

/** Monday-based day of the week: 0 = Monday … 6 = Sunday. */
function weekday(year: number, month: number, day: number): number {
  return (new Date(year, month, day).getDay() + 6) % 7;
}

/**
 * A one-day season: the day itself. On a weekend the office is empty, so it
 * is the Friday before instead.
 */
function workingDay(year: number, month: number, day: number): Window {
  const wd = weekday(year, month, day);
  const date = wd >= 5 ? day - (wd - 4) : day;
  return {
    start: new Date(year, month, date).getTime(),
    end: new Date(year, month, date + 1).getTime(),
  };
}

/**
 * A week-long season: the working week the day falls in, from Monday until the
 * day is over. On a weekend it is the Monday to Friday before it.
 */
function workingWeek(year: number, month: number, day: number): Window {
  const monday = day - weekday(year, month, day);
  return {
    start: new Date(year, month, monday).getTime(),
    // The day after, or Saturday when the day is on a weekend.
    end: Math.min(
      new Date(year, month, day + 1).getTime(),
      new Date(year, month, monday + 5).getTime(),
    ),
  };
}

/**
 * Easter Sunday in the Gregorian calendar (the anonymous algorithm, as given
 * by Meeus): `month` is 0-based like Date's.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { month: Math.floor(n / 31) - 1, day: (n % 31) + 1 };
}

/**
 * Each season's window in a given year. Where two windows overlap the one
 * listed first wins: Holy Week can take in 1 April, and then April Fools' Day
 * has that one day.
 */
const SEASONS: Record<Season, (year: number) => Window> = {
  valentines: (year) => workingDay(year, 1, 14),
  'womens-day': (year) => workingDay(year, 2, 8),
  'april-fools': (year) => workingDay(year, 3, 1),
  // Holy Week: the working week before Easter Sunday (Easter Monday is a day off).
  easter: (year) => {
    const { month, day } = easterSunday(year);
    return workingWeek(year, month, day);
  },
  halloween: (year) => workingWeek(year, 9, 31),
  // Mikołajki: Santa comes on St Nicholas' Day.
  santa: (year) => workingDay(year, 11, 6),
  christmas: (year) => workingWeek(year, 11, 25),
};

export function isSeason(value: unknown): value is Season {
  return typeof value === 'string' && Object.hasOwn(SEASONS, value);
}

/** The end of `season`'s window still ahead of (or running at) `date`. */
function seasonEnd(season: Season, date: Date): number {
  const { end } = SEASONS[season](date.getFullYear());
  return date.getTime() < end ? end : SEASONS[season](date.getFullYear() + 1).end;
}

/**
 * `?theme=<season>` forces that dressing for the browser tab until the season
 * is over, so it can be looked at (or started early) outside its window;
 * `?theme=none` turns it off and `?theme=auto` goes back to the calendar.
 *
 * The parameter is taken out of the address once read. The tablet reloads
 * itself every night (useDailyReload), and with the parameter still in the URL
 * each reload would arm the theme again — past the season, into next year.
 */
const override: Override | null = (() => {
  const url = new URL(window.location.href);
  const param = url.searchParams.get('theme');
  if (param !== null) {
    if (isSeason(param)) {
      session.set(
        SESSION_KEY,
        JSON.stringify({ theme: param, until: seasonEnd(param, new Date()) }),
      );
    } else if (param === 'none') session.set(SESSION_KEY, JSON.stringify({ theme: 'none' }));
    else if (param === 'auto') session.remove(SESSION_KEY);
    url.searchParams.delete('theme');
    window.history.replaceState(window.history.state, '', url);
  }
  try {
    const stored = JSON.parse(session.get(SESSION_KEY) ?? 'null') as Override | null;
    return isSeason(stored?.theme) || stored?.theme === 'none' ? stored : null;
  } catch {
    return null;
  }
})();

/** Set by the dev mock (`?template`): this season, whatever the date. */
let forced: Season | undefined;

export function forceSeason(season: Season): void {
  forced = season;
}

/** The season on `date`, if it falls in one's window (see `SEASONS`). */
export function seasonOn(date: Date): Season | null {
  if (forced) return forced;
  if (override?.theme === 'none') return null;
  // A forced season ends with the real one.
  if (override && date.getTime() < override.until) return override.theme;
  const year = date.getFullYear();
  const at = date.getTime();
  for (const season of Object.keys(SEASONS) as Season[]) {
    const { start, end } = SEASONS[season](year);
    if (at >= start && at < end) return season;
  }
  return null;
}
