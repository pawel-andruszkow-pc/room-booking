import { useCallback, useEffect, useRef } from 'react';

/** Marker attribute for the element whose taps count towards the secret gesture. */
export const SECRET_TAP_ATTR = 'data-secret-tap';

/**
 * Returns an onPointerDown handler for the clock. `onTrigger` fires after
 * `count` consecutive taps on it with at most `maxGapMs` between taps. Any
 * pause longer than that, or a tap anywhere else on the screen, resets the
 * sequence. Used to open the PIN-protected settings from kiosk mode without a
 * visible button.
 */
export function useSecretTap(onTrigger: () => void, count = 5, maxGapMs = 1000) {
  const taps = useRef(0);
  const lastTap = useRef(0);

  // Taps outside the marked element reset the sequence (capture phase, so it
  // runs before React's own handlers regardless of what was tapped).
  useEffect(() => {
    const onAnyPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.(`[${SECRET_TAP_ATTR}]`)) {
        taps.current = 0;
      }
    };
    document.addEventListener('pointerdown', onAnyPointerDown, true);
    return () => document.removeEventListener('pointerdown', onAnyPointerDown, true);
  }, []);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current > maxGapMs) taps.current = 0;
    lastTap.current = now;
    taps.current += 1;
    if (taps.current >= count) {
      taps.current = 0;
      onTrigger();
    }
  }, [onTrigger, count, maxGapMs]);
}
