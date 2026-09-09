import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

/** Basic-credentials sign-in. Credentials are stored on the device afterwards. */
export const LoginPage = observer(function LoginPage() {
  const { auth, device } = useStores();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.login(user, password);
      await device.register();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-ink px-8">
      <form
        onSubmit={submit}
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.06] p-12 shadow-2xl"
      >
        <div className="mb-10 flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400 text-ink">
            <DoorOpen className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Room Booking</h1>
            <p className="text-white/60">Sign in to connect this device</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Label htmlFor="user">Username</Label>
            <Input
              id="user"
              autoComplete="username"
              autoCapitalize="none"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 h-7 text-red-300">{error}</div>

        <Button type="submit" variant="accent" size="lg" className="mt-4 w-full" disabled={busy}>
          {busy ? <Spinner /> : 'Sign in'}
        </Button>
      </form>
    </div>
  );
});
