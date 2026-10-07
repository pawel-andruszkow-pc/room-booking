import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { AlarmClockPlus, BellRing, Timer, X } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Button } from '@/components/ui/button';
import { formatCountdown } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * The timer's place on the room screen, next to "Today": a way to set one
 * while none is running, the countdown while one is, and "Time's up" once it
 * has rung — which a tap dismisses.
 *
 * Its own observer, so the second-by-second countdown re-renders this and
 * nothing else on the page.
 */
export const TimerBadge = observer(function TimerBadge({ className }: { className?: string }) {
  const { timer } = useStores();
  const navigate = useNavigate();

  if (timer.finished) {
    return (
      <button
        type="button"
        onClick={timer.cancel}
        aria-label="Dismiss timer"
        className={cn(
          'flex h-[4.5rem] items-center gap-3 rounded-2xl bg-attention px-6 text-2xl font-bold text-ink',
          'animate-pulse-soft transition-transform duration-150 ease-out select-none active:scale-[0.97]',
          className,
        )}
      >
        <BellRing className="h-8 w-8 shrink-0" />
        Time&apos;s up
        <X className="ml-1 h-7 w-7 shrink-0 opacity-70" />
      </button>
    );
  }

  if (timer.active) {
    return (
      <Button
        variant="outline"
        size="lg"
        className={cn('tabular', className)}
        onClick={() => navigate('/timer')}
        aria-label="Timer"
      >
        <Timer className="h-8 w-8" />
        {formatCountdown(timer.secondsLeft)}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="lg"
      className={cn('text-white/85', className)}
      onClick={() => navigate('/timer')}
    >
      <AlarmClockPlus className="h-8 w-8" /> Timer
    </Button>
  );
});
