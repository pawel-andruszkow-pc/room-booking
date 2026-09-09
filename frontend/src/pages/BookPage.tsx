import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import * as Slider from '@radix-ui/react-slider';
import { Check } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatDuration, formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/** 15 min … 2 h in 15-minute steps. */
const PRESETS = Array.from({ length: 8 }, (_, i) => (i + 1) * 15);
const STEP = 5;
const DEFAULT_MINUTES = 30;

/**
 * Dedicated page (not a modal) to pick how long to book the room for.
 * Presets and the slider share one value: tapping a preset moves the slider,
 * dragging the slider highlights a preset when it lands on one. No title is
 * asked for — walk-in meetings get a default name.
 */
export const BookPage = observer(function BookPage() {
  const { device, room, toast } = useStores();
  const navigate = useNavigate();
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set the moment the user confirms; freezes the page while it fades out. */
  const submitted = useRef(false);
  const redirected = useRef(false);

  useEffect(() => {
    if (device.roomId) room.start(device.roomId);
  }, [device.roomId, room]);

  const status = room.status;
  const tz = room.timezone;
  // After confirming, keep showing the numbers the user chose rather than the
  // (now busy) room status the store already switched to.
  const available = submitted.current ? Number.MAX_SAFE_INTEGER : room.availableMinutes;

  // Longest duration the slider can offer, rounded down to the step.
  const max = submitted.current
    ? (duration ?? STEP)
    : Math.max(STEP, Math.floor(available / STEP) * STEP);
  const canBook = available >= STEP;

  // Pick a sensible default once the status is known, and keep the value
  // inside the shrinking window as time passes or the next meeting approaches.
  useEffect(() => {
    if (!status || submitted.current) return;
    setDuration((d) => {
      if (!canBook) return null;
      if (d === null) return Math.min(DEFAULT_MINUTES, max);
      return Math.min(d, max);
    });
  }, [status, max, canBook]);

  // If someone else took the room while this page was open, go back — once.
  // Our own booking (optimistic or confirmed) never counts as "taken".
  useEffect(() => {
    if (!status || status.state === 'free') return;
    if (submitted.current || redirected.current) return;
    if (room.busy || room.optimistic) return;
    if (status.current && room.isOwnBooking(status.current.id)) return;
    redirected.current = true;
    toast.info('Room is no longer free');
    navigate('/', { replace: true });
  }, [status, room, navigate, toast]);

  const endTime = useMemo(
    () => (duration ? formatTime(new Date(Date.now() + duration * 60000), tz) : null),
    [duration, tz],
  );

  // Optimistic: RoomStore shows the room as busy immediately, so we can return
  // to the room screen without waiting for the calendar round-trip. A failure
  // rolls the status back and surfaces a toast on the room screen.
  const confirm = () => {
    if (!duration || busy) return;
    setBusy(true);
    submitted.current = true;
    room
      .book(duration)
      .catch((err: Error) => toast.error('Booking failed, room is still free', err.message));
    toast.success(`Booked until ${endTime}`);
    navigate('/', { replace: true });
  };

  return (
    <PageShell
      title={`Book ${status?.room.name ?? 'room'}`}
      subtitle={
        !status
          ? undefined
          : submitted.current
            ? 'Booking…'
            : canBook
              ? `Free for ${formatDuration(available)}${status.freeUntil && room.next ? ` · next meeting at ${formatTime(status.freeUntil, tz)}` : ''}`
              : 'The room is free for less than 5 minutes'
      }
      timezone={tz}
    >
      {!status ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr] gap-12">
          <div>
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-white/60">How long?</h2>
            <div className="grid grid-cols-4 gap-4">
              {PRESETS.map((minutes) => {
                const fits = minutes <= available;
                const active = duration === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    disabled={!fits}
                    onClick={() => setDuration(minutes)}
                    className={cn(
                      'h-28 rounded-2xl text-3xl font-bold transition-[transform,background-color,color] duration-150 active:scale-95',
                      'disabled:cursor-not-allowed disabled:opacity-25',
                      active ? 'bg-emerald-400 text-ink shadow-lg shadow-emerald-900/30' : 'bg-white/10 hover:bg-white/15',
                    )}
                  >
                    {formatDuration(minutes)}
                  </button>
                );
              })}
            </div>

          </div>

          <div className="flex flex-col">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-white/60">
              Fine-tune
            </h2>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <div className="mb-6 flex items-baseline justify-between">
                <span className="tabular text-5xl font-extrabold">
                  {duration ? formatDuration(duration) : '—'}
                </span>
                <span className="text-lg text-white/60">
                  {STEP} min – {formatDuration(max)}
                </span>
              </div>
              <Slider.Root
                className="relative flex h-12 w-full touch-none select-none items-center"
                min={STEP}
                max={max}
                step={STEP}
                value={[duration ?? STEP]}
                disabled={!canBook}
                onValueChange={([v]) => setDuration(v)}
              >
                <Slider.Track className="relative h-3 grow rounded-full bg-white/15">
                  <Slider.Range className="absolute h-full rounded-full bg-emerald-400" />
                </Slider.Track>
                <Slider.Thumb
                  className="block h-12 w-12 rounded-full bg-white shadow-lg ring-4 ring-emerald-400/30 focus:outline-none"
                  aria-label="Duration"
                />
              </Slider.Root>
            </div>

            <Button
              size="xl"
              variant="success"
              className="mt-8 w-full"
              disabled={!duration || busy || duration > available}
              aria-busy={busy}
              onClick={confirm}
            >
              {busy ? <Spinner className="h-8 w-8" /> : <Check className="h-9 w-9" />}
              {duration ? `Book for ${formatDuration(duration)}` : 'Pick a duration'}
            </Button>
            {endTime && (
              <p className="mt-4 text-center text-xl text-white/60">
                Ends at <span className="tabular font-semibold text-white">{endTime}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
});
