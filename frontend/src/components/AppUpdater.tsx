import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useLocation } from 'react-router-dom';
import { useStores } from '@/stores/StoreContext';

/**
 * Pages a reload may interrupt without losing anything: the kiosk room screen
 * and the read-only day view. Everywhere else someone is typing a PIN, picking
 * a duration or editing rooms, so the pending update waits until they leave.
 */
const RELOAD_SAFE_PATHS = new Set(['/', '/today']);

/**
 * Renders nothing; tells `UpdateStore` when the screen is safe to reload so a
 * new deploy can take over the tablet on its own. See `UpdateStore`.
 */
export const AppUpdater = observer(function AppUpdater() {
  const { room, update } = useStores();
  const { pathname } = useLocation();
  // An action in flight would be lost with the page that started it.
  const safe = RELOAD_SAFE_PATHS.has(pathname) && !room.busy;

  useEffect(() => {
    update.setSafeToReload(safe);
  }, [safe, update]);

  return null;
});
