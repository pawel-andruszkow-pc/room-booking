import { useCallback, useEffect } from 'react';
import { useStores } from '@/stores/StoreContext';

/**
 * Kiosk behaviour for wall tablets:
 *  - hides the cursor and disables selection / context menus (via the `kiosk` class)
 *  - keeps the screen awake with the Wake Lock API
 *  - enters fullscreen on the first touch (browsers require a user gesture)
 * Everything is undone when `active` turns false.
 */
export function useKiosk(active: boolean) {
  const { device } = useStores();

  const requestFullscreen = useCallback(async () => {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    try {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* Not allowed (no gesture / iframe) — the UI still works without it. */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('kiosk', active);
    if (!active) return;

    const onContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', onContextMenu);

    // Fullscreen needs a gesture: piggy-back on the first tap.
    const onPointerDown = () => void requestFullscreen();
    document.addEventListener('pointerdown', onPointerDown);

    const onFullscreenChange = () => device.setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    onFullscreenChange();

    // Wake lock is released by the browser whenever the tab is hidden; re-acquire it.
    let wakeLock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        wakeLock = null;
      }
    };
    const onVisibility = () => void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    void acquire();

    return () => {
      document.documentElement.classList.remove('kiosk');
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibility);
      void wakeLock?.release();
    };
  }, [active, device, requestFullscreen]);

  return { requestFullscreen };
}
