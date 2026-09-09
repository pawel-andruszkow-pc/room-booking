import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useStores } from '@/stores/StoreContext';
import { RequireAuth } from '@/components/RequireAuth';
import { PageTransition } from '@/components/PageTransition';
import { Toaster } from '@/components/ui/toaster';
import { Spinner } from '@/components/ui/spinner';
import { LoginPage } from '@/pages/LoginPage';
import { RoomPage } from '@/pages/RoomPage';
import { BookPage } from '@/pages/BookPage';
import { TodayPage } from '@/pages/TodayPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AdminPage } from '@/pages/admin/AdminPage';

export const App = observer(function App() {
  const store = useStores();
  const location = useLocation();

  useEffect(() => {
    void store.bootstrap();
  }, [store]);

  // Key transitions on the top-level segment so /admin tab switches don't re-animate.
  const segment = location.pathname.split('/')[1] || 'room';

  // Credentials and the device assignment are both known before the first
  // route renders, so a reload never flashes the login or "not assigned" page.
  if (!store.booted) {
    return (
      <div className="flex h-full items-center justify-center bg-ink">
        <Spinner className="h-10 w-10 text-white/60" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={segment}>
          <Route
            path="/login"
            element={
              <PageTransition>
                <LoginPage />
              </PageTransition>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <PageTransition>
                  <RoomPage />
                </PageTransition>
              </RequireAuth>
            }
          />
          <Route
            path="/book"
            element={
              <RequireAuth>
                <PageTransition>
                  <BookPage />
                </PageTransition>
              </RequireAuth>
            }
          />
          <Route
            path="/today"
            element={
              <RequireAuth>
                <PageTransition>
                  <TodayPage />
                </PageTransition>
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <PageTransition>
                  <SettingsPage />
                </PageTransition>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <PageTransition>
                  <AdminPage />
                </PageTransition>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <Toaster />
    </div>
  );
});
