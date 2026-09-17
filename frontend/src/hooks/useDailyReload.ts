import { useEffect } from 'react';

/** Wall-clock hour the tablet reloads itself at. */
const HOUR = 7;

/**
 * Reloads the page at 07:00 every day, so a tablet that has been running
 * unattended for months starts each day on a fresh one.
 *
 * The timeout is set for the next 07:00 rather than repeating every 24 h, so
 * the hour stays put across DST changes. After the reload the page mounts again
 * and books the next one.
 */
export function useDailyReload() {
  useEffect(() => {
    const next = new Date();
    next.setHours(HOUR, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

    const timer = window.setTimeout(() => window.location.reload(), next.getTime() - Date.now());
    return () => window.clearTimeout(timer);
  }, []);
}
