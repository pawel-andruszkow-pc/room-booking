import { useCallback, useEffect, useState } from 'react';
import { motion, useAnimate } from 'motion/react';
import { Delete, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinPadProps {
  title: string;
  description?: string;
  onSubmit: (pin: string) => Promise<void>;
}

/** PINs are always exactly this many digits (see backend DTOs). */
export const PIN_LENGTH = 4;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'] as const;

/**
 * Full-page numeric keypad. Accepts exactly PIN_LENGTH digits and submits only
 * on OK (or Enter); shakes + clears on a wrong PIN.
 */
export function PinPad({ title, description, onSubmit }: PinPadProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, animate] = useAnimate();

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== PIN_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      try {
        await onSubmit(value);
      } catch (err) {
        setError((err as Error).message || 'Wrong PIN');
        setPin('');
        void animate(scope.current, { x: [0, -14, 14, -10, 10, -4, 4, 0] }, { duration: 0.45 });
      } finally {
        setBusy(false);
      }
    },
    [busy, onSubmit, animate, scope],
  );

  const press = useCallback(
    (key: (typeof KEYS)[number]) => {
      setError(null);
      if (key === 'back') {
        setPin((p) => p.slice(0, -1));
      } else if (key === 'ok') {
        void submit(pin);
      } else if (pin.length < PIN_LENGTH) {
        setPin(pin + key);
      }
    },
    [pin, submit],
  );

  // Physical keyboard support for desktop admins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    // Padding matches the back button offset (top-8 / left-12) so the pad never
    // collides with it; every size scales with viewport height to fit short screens.
    <div className="flex h-full flex-col items-center justify-center gap-[clamp(0.75rem,3vh,2.5rem)] px-12 py-8">
      <div className="text-center">
        <div className="mx-auto mb-[clamp(0.5rem,2vh,1.5rem)] flex h-[clamp(3rem,8vh,5rem)] w-[clamp(3rem,8vh,5rem)] items-center justify-center rounded-full bg-white/10">
          <Lock className="h-[45%] w-[45%]" />
        </div>
        <h1 className="text-[clamp(1.5rem,4vh,2.25rem)] font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-[clamp(1rem,2.4vh,1.25rem)] text-white/60">{description}</p>
        )}
      </div>

      <div ref={scope} className="flex h-6 items-center gap-4" aria-label="PIN entered">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{ scale: i < pin.length ? 1 : 0.6, opacity: i < pin.length ? 1 : 0.35 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="block h-4 w-4 rounded-full bg-white"
          />
        ))}
      </div>

      <div className="h-6 text-lg leading-6 text-red-300">{error}</div>

      <div className="grid grid-cols-3 gap-[clamp(0.5rem,1.5vh,1rem)]">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy || (key === 'ok' && pin.length !== PIN_LENGTH)}
            onPointerDown={(e) => {
              e.preventDefault();
              press(key);
            }}
            className={cn(
              'flex h-[clamp(3.5rem,10.5vh,6rem)] w-[clamp(5rem,14vh,8rem)] items-center justify-center rounded-2xl',
              'text-[clamp(1.5rem,4.5vh,2.25rem)] font-semibold transition-[transform,background-color] duration-100',
              'active:scale-95 disabled:opacity-30',
              key === 'ok' ? 'bg-emerald-400 text-ink' : 'bg-white/10 hover:bg-white/15',
            )}
            aria-label={key === 'back' ? 'Delete' : key === 'ok' ? 'Unlock' : key}
          >
            {key === 'back' ? <Delete className="h-[1em] w-[1em]" /> : key === 'ok' ? 'OK' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
