import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { Navigate, useLocation } from 'react-router-dom';
import { useStores } from '@/stores/StoreContext';
import { Spinner } from '@/components/ui/spinner';

/** Redirects to the login page until Basic credentials are verified. */
export const RequireAuth = observer(function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useStores();
  const location = useLocation();

  if (auth.state === 'unknown' || auth.state === 'checking') {
    return (
      <div className="flex h-full items-center justify-center bg-ink">
        <Spinner className="h-10 w-10 text-white/60" />
      </div>
    );
  }
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
});
