import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Default time without a touch before a secondary page returns to the room screen. */
export const IDLE_RETURN_MS = 60_000;

/** Anything that counts as "someone is still using this screen". */
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/**
 * Sends the tablet back to the room screen after `ms` of inactivity.
 *
 * Every page other than the room screen is opened for one thing — a glance
 * at the day, a booking — and a wall tablet is then walked away from, not
 * closed. Without this, the next person finds a half-finished picker instead
 * of the room's state. Any touch, scroll or key restarts the countdown, and
 * `enabled: false` pauses it (e.g. while a booking request is in flight).
 */
export function useIdleReturn(ms = IDLE_RETURN_MS, enabled = true) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => navigate('/', { replace: true }), ms);
    };
    // Capture phase, so scrolls inside the content column count too.
    for (const type of ACTIVITY_EVENTS)
      document.addEventListener(type, arm, { capture: true, passive: true });
    arm();
    return () => {
      window.clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS)
        document.removeEventListener(type, arm, { capture: true });
    };
  }, [ms, enabled, navigate]);
}
