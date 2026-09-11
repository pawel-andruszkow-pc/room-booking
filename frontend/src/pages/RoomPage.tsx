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

/**
 * Below this many minutes the countdown to the next meeting turns orange, so a
 * glance from the corridor shows the room is about to be taken.
 */
const MEETING_SOON_MINUTES = 15;

const panelMotion = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

/**
 * State panels only cross-fade; the headline carries the movement. The
 * outgoing word sinks and fades, the incoming one drops in from above while
 * the background colour crosses from green to orange (see `bg` transition).
 *
 * The `custom` value is `true` when the change came from a tap on this tablet
 * (see RoomStore.changedByUser): then everything switches instantly, because
 * the person is looking at the button they just pressed, not at the headline.
 */
const fade = (instant: boolean) => ({ duration: instant ? 0 : 0.35, ease: 'easeInOut' as const });
const statePanelVariants = {
  initial: { opacity: 0 },
  animate: (instant: boolean) => ({ opacity: 1, transition: fade(instant) }),
  exit: (instant: boolean) => ({ opacity: 0, transition: fade(instant) }),
};
const headlineVariants = {
  initial: (instant: boolean) => (instant ? { opacity: 1, y: 0 } : { opacity: 0, y: '-40%' }),
  animate: (instant: boolean) => ({
    opacity: 1,
    y: 0,
    transition: { duration: instant ? 0 : 0.4, ease: 'easeInOut' as const },
  }),
  exit: (instant: boolean) =>
    instant
      ? { opacity: 0, transition: { duration: 0 } }
      : { opacity: 0, y: '40%', transition: { duration: 0.4, ease: 'easeInOut' as const } },
};
const stateMotion = (instant: boolean) => ({
  variants: statePanelVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  custom: instant,
});
const headlineMotion = (instant: boolean) => ({
  variants: headlineVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  custom: instant,
});

/** The kiosk screen: one room, its state, and the actions that make sense right now. */
export const RoomPage = observer(function RoomPage() {
  const { auth, device, room, toast } = useStores();
  const navigate = useNavigate();
  useKiosk(device.isKiosk);
  const secretTap = useSecretTap(() => navigate('/settings'));

  const [confirmFree, setConfirmFree] = useState(false);
  const state = room.state;

  useEffect(() => {
    if (device.roomId) room.start(device.roomId);
  }, [device.roomId, room]);

  // Being back on the room screen means the person who unlocked settings has
  // walked away: forget the PINs so the next 5-tap asks for one again.
  useEffect(() => {
    auth.lock();
  }, [auth]);

  // The "Free up the room?" question auto-cancels after 6 s and whenever the
  // room stops being busy (meeting ended elsewhere, status changed).
  useEffect(() => {
    if (!confirmFree) return;
    if (state !== 'busy') {
      setConfirmFree(false);
      return;
    }
    const t = window.setTimeout(() => setConfirmFree(false), 6000);
    return () => window.clearTimeout(t);
  }, [confirmFree, state]);

  if (!device.isAssigned) return <UnassignedScreen />;

  const status = room.status;
  const tz = room.timezone;
  const bg =
    !status ? 'bg-ink' : state === 'free' ? 'bg-free' : 'bg-busy';
  // A tap on this tablet switches the screen instantly; only changes that
  // arrive from the clock or the calendar get the free/busy animation.
  const instant = room.changedByUser;

  // Actions are optimistic (see RoomStore): the screen flips immediately, so
  // feedback is shown right away and only a failure (with rollback) interrupts.
  const act = (fn: () => Promise<void>, success?: string) => {
    if (success) toast.success(success);
    fn().catch((err: Error) => toast.error('Action failed, reverted', err.message));
  };

  return (
    <div className={cn('relative h-full overflow-hidden transition-colors duration-[900ms] ease-in-out', bg)}>
      {/* Depth without repaint cost: static radial gradient overlay. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,rgba(255,255,255,0.18),transparent_55%),radial-gradient(90%_80%_at_100%_100%,rgba(0,0,0,0.22),transparent_60%)]" />

      {/* Dims everything except the footer buttons while confirming "Free up the room?". */}
      <AnimatePresence>
        {confirmFree && (
          <motion.div
            key="dim"
            className="absolute inset-0 z-10 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onPointerDown={() => setConfirmFree(false)}
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
            <div className="space-y-6">
              <div className="flex items-center gap-8 text-5xl font-semibold text-white/70">
                <Spinner className="h-20 w-20 text-white/80" /> Loading room…
              </div>
              {room.error && (
                <p className="max-w-3xl text-2xl leading-snug text-rose-300/90">{room.error}</p>
              )}
            </div>
          )}
          <AnimatePresence mode="wait" initial={false} custom={instant}>
            {!status ? null : state === 'free' ? (
              <motion.div
                key="free"
                {...stateMotion(instant)}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <motion.h1 {...headlineMotion(instant)} className={headlineClass}>
                    Free
                  </motion.h1>
                </div>
                {room.next ? (
                  <DetailPanel
                    icon={CalendarClock}
                    label="Next meeting"
                    value={formatDuration(room.minutesUntilNext ?? 0)}
                    at={formatTime(room.next.start, tz)}
                    // Warm yellow reads as "about to change" against the green
                    // screen, and keeps its distance from it in luminance —
                    // a mid-tone orange sits at almost the same brightness as
                    // the background and goes muddy from down the corridor.
                    valueClassName={cn(
                      (room.minutesUntilNext ?? Infinity) < MEETING_SOON_MINUTES &&
                        'text-[#ffd230]',
                    )}
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
                key="check"
                {...stateMotion(instant)}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <motion.h1 {...headlineMotion(instant)} className={headlineClass}>
                    Busy
                  </motion.h1>
                </div>
                <div className={splitRightClass}>
                  <p className="text-[clamp(1.5rem,2.4vw,2.875rem)] font-bold leading-tight">
                    Is this meeting taking place?
                  </p>
                  <p className="mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1rem,1.5vw,1.625rem)] text-white/80">
                    Room will be freed up in <CountdownLabel />
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
                      onClick={() => act(room.release, 'Room freed up')}
                    >
                      <X className="h-[1.4em] w-[1.4em] shrink-0" />
                      Free up the room
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : room.current ? (
              <motion.div
                key="busy"
                {...stateMotion(instant)}
                className={splitClass}
              >
                <div className={splitLeftClass}>
                  <motion.h1 {...headlineMotion(instant)} className={headlineClass}>
                    Busy
                  </motion.h1>
                </div>
                <DetailPanel
                  icon={Timer}
                  label="Free in"
                  value={formatDuration(room.minutesUntilFree ?? 0)}
                  at={formatTime(room.busyUntil ?? room.current.end, tz)}
                  note={
                    room.followingMeeting
                      ? `Then “${room.followingMeeting.title}” at ${formatTime(room.followingMeeting.start, tz)}`
                      : undefined
                  }
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Question rendered above the (unchanged) button row, over the dim layer. */}
          <AnimatePresence>
            {confirmFree && state === 'busy' && (
              <motion.h2
                key="free-question"
                className="absolute bottom-4 left-0 z-20 text-5xl font-bold tracking-tight"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
              >
                Free up the room?
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
              <motion.div key="free-room" {...panelMotion} className="w-full">
                <FreeRoomButton
                  confirming={confirmFree}
                  disabled={room.busy}
                  onConfirmingChange={setConfirmFree}
                  onConfirm={() => {
                    setConfirmFree(false);
                    act(room.endMeeting);
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
  note,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  at: string;
  /** Small trailing line, e.g. the meeting that follows without a break. */
  note?: string;
  /** Extra classes for the figure, e.g. the orange "meeting soon" colour. */
  valueClassName?: string;
}) {
  return (
    <div className={splitRightClass}>
      <div className={panelLabelClass}>
        <Icon className="h-[1.15em] w-[1.15em] shrink-0" />
        {label}
      </div>
      <div
        className={cn(
          'mt-[clamp(0.75rem,1.2vw,1.5rem)] text-[clamp(3.25rem,5.8vw,6.5rem)] font-extrabold leading-none tracking-tight transition-colors duration-500',
          valueClassName,
        )}
      >
        {value}
      </div>
      <div className="tabular mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1.75rem,2.8vw,3.25rem)] font-semibold text-white/90">
        at {at}
      </div>
      {note && (
        <div className="mt-[clamp(0.5rem,0.8vw,1rem)] truncate text-[clamp(1.1rem,1.6vw,1.75rem)] text-white/70">
          {note}
        </div>
      )}
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
 * Two-step "Free up the room" without a modal. The button row stays in place;
 * the parent dims the screen and shows the "Free up the room?" title while
 * `confirming` is true.
 *
 * The label says what the tap does to the room, not to the meeting: "End
 * meeting" read as if it would cancel the meeting itself for everyone, which
 * is exactly what someone standing in front of a booked room does not want.
 */
function FreeRoomButton({
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
        Free up the room
      </Button>
    );
  }
  return (
    <div className={pairClass}>
      <Button size="xl" variant="primary" className={pairButtonClass} disabled={disabled} onClick={onConfirm}>
        <Check className="h-[1.2em] w-[1.2em] shrink-0" />
        <span className="truncate">Yes, free it</span>
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
