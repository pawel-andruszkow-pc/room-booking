import { useEffect } from 'react';

/** Wall-clock hour the tablet reloads itself at. */
const HOUR = 7;

/** How often the wall clock is checked. */
const TICK_MS = 30_000;

/**
 * Reloads the page once a day at 07:00, so a tablet that has been running
 * unattended for months starts each day on a fresh one.
 *
 * The kiosk turns the screen off overnight and Android suspends the CPU while
 * it is off. A single long `setTimeout` runs on a monotonic clock that stops
 * during suspend, so it would fire hours late. Polling the wall clock instead
 * is immune to that: the first tick after the screen wakes sees the real time
 * and reloads if 07:00 has passed.
 *
 * The day already reloaded is kept in memory only. A page that mounts after
 * 07:00 counts that day as done, so the fresh page after a reload (or a deploy
 * during the day) does not reload again; a page that mounts before 07:00 still
 * reloads at 07:00 that day.
 */
export function useDailyReload() {
  useEffect(() => {
    const dayOf = (d: Date) => d.toDateString();
    const now = new Date();
    let reloadedDay: string | null = now.getHours() >= HOUR ? dayOf(now) : null;

    const timer = window.setInterval(() => {
      const t = new Date();
      if (t.getHours() < HOUR || reloadedDay === dayOf(t)) return;
      reloadedDay = dayOf(t);
      window.location.reload();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
}
