import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  MapPin,
  Settings,
  Timer,
  WifiOff,
  X,
} from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { useKiosk } from '@/hooks/useKiosk';
import { useSecretTap } from '@/hooks/useSecretTap';
import { Button } from '@/components/ui/button';
import { Clock } from '@/components/Clock';
import { Spinner } from '@/components/ui/spinner';
import { formatCountdown, formatDuration, formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/** Every state headline is one short word, so they all share a size. */
const headlineClass =
  'text-[clamp(8rem,13.5vw,15rem)] font-extrabold leading-[0.9] tracking-tight';

/**
 * Free and busy share one layout (see design): the state word on the left, a
 * labelled figure on the right of a divider.
 */
const splitClass = 'flex items-stretch gap-[clamp(2rem,4vw,5rem)]';
const splitLeftClass = 'flex min-w-0 flex-1 flex-col justify-center';
const splitRightClass =
  'flex w-[45%] shrink-0 flex-col justify-center border-l border-white/25 pl-[clamp(2rem,3.5vw,4rem)]';

/** Small heading above the figure in the right-hand column. */
const panelLabelClass =
  'flex items-center gap-3 text-[clamp(1.5rem,2.1vw,2.375rem)] font-medium text-white/80';

/** Check-in answers: icon beside the label, sized to fit the right column. */
const checkInButtonClass =
  'h-[clamp(3.25rem,4.5vw,5rem)] gap-[clamp(0.5rem,0.8vw,1rem)] px-[clamp(0.875rem,1.4vw,2rem)] text-[clamp(1rem,1.3vw,1.5rem)]';

/** Two buttons side by side must share the left column at any width. */
const pairClass = 'flex w-full gap-[clamp(0.75rem,1.2vw,1.25rem)]';
const pairButtonClass =
  'min-w-0 flex-1 px-[clamp(1rem,2.4vw,3rem)] text-[clamp(1.25rem,1.7vw,1.875rem)]';

const panelMotion = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

/** The kiosk screen: one room, its state, and the actions that make sense right now. */
export const RoomPage = observer(function RoomPage() {
  const { auth, device, room, toast } = useStores();
  const navigate = useNavigate();
  useKiosk(device.isKiosk);
  const secretTap = useSecretTap(() => navigate('/settings'));

  const [confirmEnd, setConfirmEnd] = useState(false);
  const state = room.state;

  useEffect(() => {
    if (device.roomId) room.start(device.roomId);
  }, [device.roomId, room]);

  // Being back on the room screen means the person who unlocked settings has
  // walked away: forget the PINs so the next 5-tap asks for one again.
  useEffect(() => {
    auth.lock();
  }, [auth]);

  // The "End meeting now?" question auto-cancels after 6 s and whenever the
  // room stops being busy (meeting ended elsewhere, status changed).
  useEffect(() => {
    if (!confirmEnd) return;
    if (state !== 'busy') {
      setConfirmEnd(false);
      return;
    }
    const t = window.setTimeout(() => setConfirmEnd(false), 6000);
    return () => window.clearTimeout(t);
  }, [confirmEnd, state]);

  if (!device.isAssigned) return <UnassignedScreen />;

  const status = room.status;
  const tz = room.timezone;
  const bg =
    !status ? 'bg-ink' : state === 'free' ? 'bg-free' : 'bg-busy';

  // Actions are optimistic (see RoomStore): the screen flips immediately, so
  // feedback is shown right away and only a failure (with rollback) interrupts.
  const act = (fn: () => Promise<void>, success?: string) => {
    if (success) toast.success(success);
    fn().catch((err: Error) => toast.error('Action failed, reverted', err.message));
  };

  return (
    <div className={cn('relative h-full overflow-hidden transition-colors duration-700 ease-in-out', bg)}>
      {/* Depth without repaint cost: static radial gradient overlay. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,rgba(255,255,255,0.18),transparent_55%),radial-gradient(90%_80%_at_100%_100%,rgba(0,0,0,0.22),transparent_60%)]" />

      {/* Dims everything except the footer buttons while confirming "End meeting now?". */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div
            key="dim"
            className="absolute inset-0 z-10 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onPointerDown={() => setConfirmEnd(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative flex h-full flex-col px-[clamp(2.5rem,4.2vw,5rem)] py-[clamp(2rem,3vw,3.5rem)]">
        {/* Top: room name on the left, clock on the right (tap 5x to open settings). */}
        <header className="flex items-start justify-between gap-8">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-3 text-4xl font-extrabold">
              <MapPin className="h-9 w-9 shrink-0 text-white/80" />
              {status?.room.name ?? '…'}
            </span>
            {room.error && (
              <span className="flex items-center gap-2 text-xl text-white/70">
                <WifiOff className="h-5 w-5" /> Reconnecting…
              </span>
            )}
          </div>
          <Clock timezone={tz} onPointerDown={secretTap} className="-mt-3 text-right" />
        </header>

        {/* Middle: the one thing that matters right now. */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-center">
          {/* Loading placeholder lives outside AnimatePresence so the first real
              state appears immediately instead of waiting for an exit animation. */}
          {!status && (
            <div className="flex items-center gap-4 text-3xl text-white/70">
              <Spinner className="h-8 w-8" /> Loading room…
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {!status ? null : state === 'free' ? (
              <motion.div
                key="free"
                {...panelMotion}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <h1 className={headlineClass}>Free</h1>
                </div>
                {room.next ? (
                  <DetailPanel
                    icon={CalendarClock}
                    label="Next meeting"
                    value={formatDuration(room.minutesUntilNext ?? 0)}
                    at={formatTime(room.next.start, tz)}
                  />
                ) : (
                  // Same two columns with nothing to count down to, so the
                  // screen keeps its shape all day.
                  <div className={splitRightClass}>
                    <div className={panelLabelClass}>
                      <CalendarClock className="h-[1.15em] w-[1.15em] shrink-0" />
                      Next meeting
                    </div>
                    <div className="mt-[clamp(0.75rem,1.2vw,1.5rem)] text-[50px] font-extrabold leading-[1.05] tracking-tight">
                      No more
                      <br />
                      meetings today
                    </div>
                  </div>
                )}
              </motion.div>
            ) : state === 'awaiting-check-in' && room.current ? (
              <motion.div
                key={`check-${room.current.id}`}
                {...panelMotion}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <h1 className={headlineClass}>Busy</h1>
                </div>
                <div className={splitRightClass}>
                  <p className="text-[clamp(1.5rem,2.4vw,2.875rem)] font-bold leading-tight">
                    Is this meeting taking place?
                  </p>
                  <p className="mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1rem,1.5vw,1.625rem)] text-white/80">
                    Room will be released in <CountdownLabel />
                  </p>
                  <div className="mt-[clamp(1rem,1.6vw,2rem)] flex flex-wrap gap-[clamp(0.625rem,1vw,1.25rem)]">
                    <Button
                      variant="primary"
                      className={checkInButtonClass}
                      disabled={room.busy}
                      onClick={() => act(room.confirmPresence)}
                    >
                      <Check className="h-[1.4em] w-[1.4em] shrink-0" />
                      Yes, we&apos;re here
                    </Button>
                    <Button
                      variant="outline"
                      className={checkInButtonClass}
                      disabled={room.busy}
                      onClick={() => act(room.release, 'Room released')}
                    >
                      <X className="h-[1.4em] w-[1.4em] shrink-0" />
                      Release room
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : room.current ? (
              <motion.div
                key={`busy-${room.current.id}`}
                {...panelMotion}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <h1 className={headlineClass}>Busy</h1>
                </div>
                <DetailPanel
                  icon={Timer}
                  label="Free in"
                  value={formatDuration(room.minutesUntilCurrentEnds ?? 0)}
                  at={formatTime(room.current.end, tz)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Question rendered above the (unchanged) button row, over the dim layer. */}
          <AnimatePresence>
            {confirmEnd && state === 'busy' && (
              <motion.h2
                key="end-question"
                className="absolute bottom-4 left-0 z-20 text-5xl font-bold tracking-tight"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
              >
                End meeting now?
              </motion.h2>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom right: whole-day overview. */}
        {status && (
          <Button
            variant="ghost"
            size="lg"
            className="absolute bottom-[clamp(2rem,3vw,3.5rem)] right-[clamp(2.5rem,4.2vw,5rem)] z-20 text-white/85"
            onClick={() => navigate('/today')}
          >
            <CalendarDays className="h-8 w-8" /> Today
          </Button>
        )}

        {/* Bottom: actions, left-aligned, at most half the width. */}
        <footer className="relative z-20 flex h-28 w-full max-w-[52%] min-w-0 items-end">
          <AnimatePresence mode="wait" initial={false}>
            {state === 'free' && status && (
              <motion.div key="book" {...panelMotion}>
                <Button
                  size="xl"
                  onClick={() => navigate('/book')}
                  disabled={room.busy || room.availableMinutes < 5}
                >
                  <CalendarPlus className="h-9 w-9" />
                  Book this room
                </Button>
              </motion.div>
            )}
            {state === 'busy' && (
              <motion.div key="end" {...panelMotion} className="w-full">
                <EndMeetingButton
                  confirming={confirmEnd}
                  disabled={room.busy}
                  onConfirmingChange={setConfirmEnd}
                  onConfirm={() => {
                    setConfirmEnd(false);
                    act(room.endMeeting, 'Meeting ended');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      </div>
    </div>
  );
});

/**
 * Right-hand column of the split states: a small label, the figure that matters
 * (minutes until the room changes state) and the clock time it happens at.
 */
function DetailPanel({
  icon: Icon,
  label,
  value,
  at,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  at: string;
}) {
  return (
    <div className={splitRightClass}>
      <div className={panelLabelClass}>
        <Icon className="h-[1.15em] w-[1.15em] shrink-0" />
        {label}
      </div>
      <div className="mt-[clamp(0.75rem,1.2vw,1.5rem)] text-[clamp(3.25rem,5.8vw,6.5rem)] font-extrabold leading-none tracking-tight">
        {value}
      </div>
      <div className="tabular mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1.75rem,2.8vw,3.25rem)] font-semibold text-white/90">
        at {at}
      </div>
    </div>
  );
}

/** Own observer so only this text re-renders every second. */
const CountdownLabel = observer(function CountdownLabel() {
  const { room } = useStores();
  const left = room.checkInSecondsLeft ?? 0;
  return (
    <span className={cn('tabular font-bold', left < 60 && 'animate-pulse-soft text-amber-200')}>
      {formatCountdown(left)}
    </span>
  );
});

/**
 * Two-step "End meeting" without a modal. The button row stays in place; the
 * parent dims the screen and shows the "End meeting now?" title while
 * `confirming` is true.
 */
function EndMeetingButton({
  confirming,
  disabled,
  onConfirmingChange,
  onConfirm,
}: {
  confirming: boolean;
  disabled: boolean;
  onConfirmingChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <Button size="xl" variant="secondary" disabled={disabled} onClick={() => onConfirmingChange(true)}>
        End meeting now
      </Button>
    );
  }
  return (
    <div className={pairClass}>
      <Button size="xl" variant="primary" className={pairButtonClass} disabled={disabled} onClick={onConfirm}>
        <Check className="h-[1.2em] w-[1.2em] shrink-0" />
        <span className="truncate">Yes, end it</span>
      </Button>
      <Button
        size="xl"
        variant="outline"
        className={pairButtonClass}
        onClick={() => onConfirmingChange(false)}
      >
        Cancel
      </Button>
    </div>
  );
}

const UnassignedScreen = observer(function UnassignedScreen() {
  const { device } = useStores();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-ink text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
        <Settings className="h-12 w-12" />
      </div>
      <div>
        <h1 className="text-5xl font-bold tracking-tight">This device isn't assigned to a room</h1>
        <p className="mt-3 text-2xl text-white/60">
          Open settings, enter the settings PIN and pick the room this tablet is mounted next to.
        </p>
      </div>
      <Button size="lg" onClick={() => navigate('/settings')}>
        <Settings className="h-7 w-7" /> Open settings
      </Button>
      <p className="text-white/40">Device id: {device.deviceId}</p>
    </div>
  );
});
