import { useState, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { PinPad } from '@/components/PinPad';
import { Button } from '@/components/ui/button';
import type { PinScope } from '@/types';

interface PinGateProps {
  scope: PinScope;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Shows the keypad until the PIN for `scope` has been unlocked in this session.
 * One keypad serves both PINs: entering the admin PIN on the settings gate
 * opens the admin page directly instead of asking for it a second time.
 */
export const PinGate = observer(function PinGate({
  scope,
  title,
  description,
  children,
}: PinGateProps) {
  const { auth } = useStores();
  const navigate = useNavigate();
  // Keep showing the keypad while the redirect to a higher scope is in flight
  // so the gated content never flashes during the page transition.
  const [redirecting, setRedirecting] = useState(false);

  if (auth.hasPin(scope) && !redirecting) return <>{children}</>;

  const submit = async (pin: string) => {
    const matched = await auth.unlock(scope, pin);
    if (matched !== scope) {
      setRedirecting(true);
      navigate(`/${matched}`, { replace: true });
    }
  };

  return (
    <div className="relative h-full bg-ink">
      <Button
        variant="secondary"
        size="icon"
        className="absolute left-12 top-8 h-16 w-16 rounded-2xl"
        onClick={() => navigate('/')}
        aria-label="Back"
      >
        <ArrowLeft className="h-8 w-8" />
      </Button>
      <PinPad title={title} description={description} onSubmit={submit} />
    </div>
  );
});
