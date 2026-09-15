/**
 * Time formatting helpers. Everything is rendered in the room's timezone
 * (from settings) rather than the tablet's, so a mis-configured device still
 * shows the right times.
 */

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(tz: string): Intl.DateTimeFormat {
  let f = timeFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: safeTz(tz),
    });
    timeFormatters.set(tz, f);
  }
  return f;
}

function dateFormatter(tz: string): Intl.DateTimeFormat {
  let f = dateFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: safeTz(tz),
    });
    dateFormatters.set(tz, f);
  }
  return f;
}

function shortDateFormatter(tz: string): Intl.DateTimeFormat {
  let f = shortDateFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: safeTz(tz),
    });
    shortDateFormatters.set(tz, f);
  }
  return f;
}

function safeTz(tz: string): string | undefined {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function formatTime(date: Date | string, tz: string): string {
  return timeFormatter(tz).format(typeof date === 'string' ? new Date(date) : date);
}

export function formatDate(date: Date | string, tz: string): string {
  return dateFormatter(tz).format(typeof date === 'string' ? new Date(date) : date);
}

/** "Wed, 5 Mar 2025" — the compact form shown under the kiosk clock. */
export function formatDateShort(date: Date | string, tz: string): string {
  return shortDateFormatter(tz).format(typeof date === 'string' ? new Date(date) : date);
}

export function formatRange(start: Date | string, end: Date | string, tz: string): string {
  return `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
}

/** "in 5 min", "in 1 h 20 min", "now" */
export function formatIn(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

/**
 * The figure on a countdown: "15 min", "1 h 30 min" — and, for the last stretch
 * before the boundary, words. "0 min" next to "at 09:30" reads as if the
 * meeting were already over (or the clock wrong), which is the one thing the
 * room screen must never look like.
 */
export function formatCountdownMinutes(minutes: number): string {
  return minutes <= 0 ? 'Less than a minute' : formatDuration(minutes);
}

/** "15 min", "1 h", "1 h 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "mm:ss" countdown from a number of seconds. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}

/**
 * Whole minutes that actually fit between the two moments. Used for capacity
 * (how long a booking starting *now* may run), so it rounds down: rounding up
 * would hand out a booking that runs seconds into the next meeting.
 */
export function minutesBetween(from: Date, to: Date | string): number {
  const t = typeof to === 'string' ? new Date(to) : to;
  return Math.floor((t.getTime() - from.getTime()) / 60000);
}

/**
 * Whole clock-minutes from `from` to `to` — the difference between the minutes
 * a clock would show, not the raw distance. The kiosk prints the time floored
 * to the minute, so a countdown taken from the exact difference can contradict
 * what is next to it: at 09:24:40 the raw gap to 09:30 rounds to "5 min" while
 * the clock still reads 09:24. Flooring both ends keeps the two in step.
 */
export function minutesUntil(from: Date, to: Date | string): number {
  const t = typeof to === 'string' ? new Date(to) : to;
  return Math.floor(t.getTime() / 60000) - Math.floor(from.getTime() / 60000);
}
