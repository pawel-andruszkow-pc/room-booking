import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { Minus, Play, Plus, TimerOff, TimerReset } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { useIdleReturn } from '@/hooks/useIdleReturn';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { formatCountdown, formatDuration } from '@/lib/time';
import { cn } from '@/lib/utils';

/** The lengths on offer as one tap, shortest first. */
const PRESET_MINUTES = [5, 10, 15, 20, 30, 45];
const DEFAULT_MINUTES = 15;
const MIN_MINUTES = 1;
/** Three hours: longer than any meeting the room is booked for. */
const MAX_MINUTES = 180;

const chipOn = 'bg-emerald-400 text-ink shadow-lg shadow-emerald-900/30';
const chipOff = 'bg-white/10 hover:bg-white/15';
const chipClass =
  'flex h-[clamp(5.5rem,14vh,8rem)] items-center justify-center rounded-2xl text-4xl font-bold transition-[background-color,color] duration-150';

/** The −/+ nudges either side of the figure; same look as the booking page has. */
const nudgeClass =
  'flex h-14 shrink-0 items-center justify-center gap-1 rounded-xl bg-white/10 px-4 text-xl font-bold transition-[transform,background-color] duration-150 hover:bg-white/15 active:scale-90 disabled:cursor-not-allowed disabled:opacity-20';

/**
 * Sets the room's timer: a length from the presets, or any number of minutes
 * nudged one or five at a time. The countdown and the ring live on the room
 * screen (see TimerBadge); this page only sets, restarts or stops it.
 */
export const TimerPage = observer(function TimerPage() {
  const { room, timer, toast } = useStores();
  const navigate = useNavigate();
  useIdleReturn();

  // A running timer opens on its own length, so "restart" is one tap.
  const [minutes, setMinutes] = useState(() => (timer.active ? timer.minutes : DEFAULT_MINUTES));
  const nudge = (delta: number) =>
    setMinutes((m) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m + delta)));

  const start = () => {
    timer.start(minutes);
    toast.success(`Timer set for ${formatDuration(minutes)}`);
    navigate('/', { replace: true });
  };

  const stop = () => {
    timer.cancel();
    toast.info('Timer stopped');
    navigate('/', { replace: true });
  };

  return (
    <PageShell
      title={timer.active ? 'Timer running' : 'Set a timer'}
      subtitle={
        timer.active
          ? `${formatCountdown(timer.secondsLeft)} left of ${formatDuration(timer.minutes)} · the room screen rings when it ends`
          : 'Pick a length, or nudge it a minute at a time · the room screen rings when it ends'
      }
      timezone={room.timezone}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-center gap-[clamp(2rem,6vh,4rem)] py-[clamp(1rem,4vh,3rem)]">
          {/* The figure, with the nudges either side of it. */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex gap-3">
              <button
                type="button"
                className={nudgeClass}
                disabled={minutes - 5 < MIN_MINUTES}
                onClick={() => nudge(-5)}
                aria-label="Minus 5 minutes"
              >
                <Minus className="h-6 w-6" /> 5
              </button>
              <button
                type="button"
                className={nudgeClass}
                disabled={minutes <= MIN_MINUTES}
                onClick={() => nudge(-1)}
                aria-label="Minus 1 minute"
              >
                <Minus className="h-6 w-6" /> 1
              </button>
            </div>
            <div className="w-[22rem] text-center">
              <div className="text-lg uppercase tracking-[0.2em] text-white/50">Timer</div>
              <div className="tabular mt-1 whitespace-nowrap text-7xl font-extrabold text-emerald-400">
                {formatDuration(minutes)}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className={nudgeClass}
                disabled={minutes >= MAX_MINUTES}
                onClick={() => nudge(1)}
                aria-label="Plus 1 minute"
              >
                <Plus className="h-6 w-6" /> 1
              </button>
              <button
                type="button"
                className={nudgeClass}
                disabled={minutes + 5 > MAX_MINUTES}
                onClick={() => nudge(5)}
                aria-label="Plus 5 minutes"
              >
                <Plus className="h-6 w-6" /> 5
              </button>
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-6">
            {PRESET_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={cn(chipClass, minutes === m ? chipOn : chipOff)}
              >
                {formatDuration(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto flex shrink-0 gap-4 pt-2">
          {timer.active && (
            <Button variant="secondary" size="xl" className="min-w-0 flex-1 basis-0" onClick={stop}>
              <TimerOff className="h-8 w-8" /> Stop timer
            </Button>
          )}
          <Button size="xl" variant="success" className="min-w-0 flex-1 basis-0" onClick={start}>
            {timer.active ? (
              <>
                <TimerReset className="h-9 w-9" /> Restart for {formatDuration(minutes)}
              </>
            ) : (
              <>
                <Play className="h-9 w-9" /> Start timer for {formatDuration(minutes)}
              </>
            )}
          </Button>
        </div>
      </div>
    </PageShell>
  );
});
