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
import { roomIsFree } from '@/types';

/** Every state headline is one short word, so they all share a size. */
/**
 * The state word. "B" and "F" both carry a 0.07em left side bearing in Manrope
 * ExtraBold, which at this size is a visible indent next to the room name and
 * the footer button; the negative margin pulls the stem onto the page margin.
 */
const headlineClass =
  '-ml-[0.05em] text-[clamp(8rem,13.5vw,15rem)] font-extrabold leading-[0.9] tracking-tight';

/**
 * "Busy soon" is the only state that needs two words. At the shared headline
 * size it runs off the column, so it steps down one notch — still unmistakably
 * the headline, still on one line at tablet widths.
 */
const soonHeadlineClass =
  '-ml-[0.05em] text-[clamp(4.5rem,8vw,9rem)] font-extrabold leading-[0.95] tracking-tight';

/**
 * Free and busy share one layout (see design): the state word on the left, a
 * labelled figure on the right of a divider.
 */
const splitClass = 'flex items-stretch gap-[clamp(2rem,4vw,5rem)]';
const splitLeftClass = 'flex min-w-0 flex-1 flex-col justify-center';
const splitRightClass =
  'flex w-[45%] shrink-0 flex-col justify-center border-l border-white/25 pl-[clamp(2rem,3.5vw,4rem)]';

/**
 * The name of the meeting the room is busy with, above the "Busy" headline.
 * ExtraLight — the lightest weight Manrope has — so it reads as a caption to
 * the state word below it, not as a second headline. Two lines at most.
 * Hung above the headline out of flow, so "Busy" sits exactly where it would
 * without a name (and where "Free" sits on the free screen).
 */
const meetingNameClass =
  'absolute inset-x-0 bottom-full mb-[clamp(0.75rem,1.2vw,1.5rem)] line-clamp-2 text-[clamp(1.75rem,2.9vw,3.375rem)] font-extralight leading-tight text-white/90';

/** Small heading above the figure in the right-hand column. */
const panelLabelClass =
  'flex items-center gap-3 text-[clamp(1.5rem,2.1vw,2.375rem)] font-medium text-white/80';

/**
 * Check-in answers: the one question a busy room asks, so they are the
 * biggest controls on the screen — full width of the right column, stacked.
 */
const checkInButtonClass =
  'w-full h-[clamp(3.75rem,5.25vw,5.75rem)] gap-[clamp(0.625rem,0.9vw,1rem)] px-[clamp(1rem,1.6vw,2rem)] text-[clamp(1.25rem,1.7vw,1.875rem)]';

/** Two buttons side by side must share the left column at any width. */
const pairClass = 'flex w-full gap-[clamp(0.75rem,1.2vw,1.25rem)]';
const pairButtonClass =
  'min-w-0 flex-1 px-[clamp(1rem,2.4vw,3rem)] text-[clamp(1.25rem,1.7vw,1.875rem)]';

/** Footer action panel. Instant on this tablet's own taps, like the headline. */
const panelMotion = (instant: boolean) => ({
  initial: instant ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: instant ? { opacity: 0 } : { opacity: 0, y: -24 },
  transition: { duration: instant ? 0 : 0.3, ease: 'easeOut' as const },
});

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
  const bg = !status ? 'bg-ink' : roomIsFree(state) ? 'bg-free' : 'bg-busy';
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
    <div
      className={cn(
        'relative h-full overflow-hidden transition-colors duration-[900ms] ease-in-out',
        bg,
      )}
    >
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
              <motion.div key="free" {...stateMotion(instant)} className={splitClass}>
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
            ) : state === 'busy-soon' && room.next ? (
              // Still free, but only just: the meeting that is about to take
              // the room hangs above the headline, the way a running one does.
              <motion.div key="soon" {...stateMotion(instant)} className={splitClass}>
                <div className={splitLeftClass}>
                  <div className="relative">
                    <p className={meetingNameClass}>{room.next.title}</p>
                    <motion.h1 {...headlineMotion(instant)} className={soonHeadlineClass}>
                      Busy soon
                    </motion.h1>
                  </div>
                </div>
                <DetailPanel
                  icon={CalendarClock}
                  label="Starts in"
                  value={formatDuration(room.minutesUntilNext ?? 0)}
                  at={formatTime(room.next.start, tz)}
                />
              </motion.div>
            ) : state === 'awaiting-check-in' && room.current ? (
              <motion.div key="check" {...stateMotion(instant)} className={splitClass}>
                <BusyHeadline instant={instant} title={room.current.title} />
                <div className={splitRightClass}>
                  <p className="text-[clamp(1.75rem,2.9vw,3.375rem)] font-bold leading-tight">
                    Is this meeting taking place?
                  </p>
                  <p className="mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1rem,1.5vw,1.625rem)] text-white/80">
                    Room will be freed up in <CountdownLabel />
                  </p>
                  <div className="mt-[clamp(1rem,1.6vw,2rem)] flex flex-col gap-[clamp(0.625rem,1vw,1.25rem)]">
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
            ) : room.current && room.isAllDay ? (
              // A full-day reservation: nothing to count down to and nothing
              // to tap — the footer has no "Free up the room" for it either.
              <motion.div key="all-day" {...stateMotion(instant)} className={splitClass}>
                <BusyHeadline instant={instant} title={room.current.title} />
                <DetailPanel
                  icon={CalendarDays}
                  label="All day"
                  value="Full-day reservation"
                  // Too long for the countdown's size; one step down lets it
                  // wrap into two readable lines instead of overflowing.
                  valueClassName="text-[clamp(2.5rem,4.4vw,5rem)] leading-[1.05]"
                  note="This reservation cannot be cancelled."
                />
              </motion.div>
            ) : room.current ? (
              <motion.div key="busy" {...stateMotion(instant)} className={splitClass}>
                <BusyHeadline instant={instant} title={room.current.title} />
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
              <motion.div key="book" {...panelMotion(instant)}>
                {/* Not disabled while the tap that freed the room is still
                    being confirmed: that made the button sit dimmed for the
                    round trip and swallow the next tap. The booking page
                    copes with a request in flight on its own. */}
                <Button
                  size="xl"
                  onClick={() => navigate('/book')}
                  disabled={room.availableMinutes < 5}
                >
                  <CalendarPlus className="h-9 w-9" />
                  Book this room
                </Button>
              </motion.div>
            )}
            {state === 'busy-soon' && status?.settings.checkInEnabled && (
              <motion.div key="soon-actions" {...panelMotion(instant)} className="w-full">
                {/* The one place a tap on this tablet is animated rather than
                    switched instantly: the swap IS the acknowledgement of the
                    tap, so the white pill shrinking away as the disc springs in
                    is the feedback. `mode="wait"` keeps them from overlapping,
                    which at this size would read as two buttons at once. */}
                <AnimatePresence mode="wait" initial={false}>
                {room.upcomingConfirmed ? (
                  // Answered — and the confirmation is itself the way back out,
                  // so the screen keeps one tap target where it had one button
                  // rather than growing a second control beside it. The second
                  // line has to say so: an undo nothing points at is an undo
                  // nobody finds. Sized off the xl button it replaces, not off
                  // the viewport, so it reads at the same weight as the tap
                  // that got here (`size="xl"` is fixed at h-24 / text-3xl).
                  <motion.button
                    key="checked-in"
                    type="button"
                    aria-label="Cancel check-in"
                    disabled={room.busy}
                    onClick={() => act(room.cancelUpcoming)}
                    className="flex h-24 items-center gap-5 rounded-3xl text-left transition-transform duration-150 ease-out select-none active:scale-[0.97] disabled:pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    transition={{ duration: 0.13 }}
                  >
                    <CheckedInMark className="h-20 w-20 shrink-0 text-white" />
                    {/* Trails the disc in from behind it, so the eye lands on
                        the mark first and reads the words second. */}
                    <motion.div
                      className="min-w-0"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.04, duration: 0.2, ease: 'easeOut' }}
                    >
                      <div className="truncate text-3xl font-bold leading-tight">
                        You&apos;re checked in
                      </div>
                      <div className="truncate text-xl text-white/75">
                        The room is held for you. Tap to cancel.
                      </div>
                    </motion.div>
                  </motion.button>
                ) : (
                  // Shrinks away rather than just fading, so the white mass of
                  // the pill reads as collapsing into the disc that replaces it.
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                  >
                    <Button
                      size="xl"
                      disabled={room.busy}
                      onClick={() => act(room.confirmUpcoming)}
                    >
                      <Check className="h-9 w-9" />
                      I&apos;m already here
                    </Button>
                  </motion.div>
                )}
                </AnimatePresence>
              </motion.div>
            )}
            {state === 'busy' && !room.isAllDay && (
              <motion.div key="busy-actions" {...panelMotion(instant)} className="w-full">
                <BusyActions
                  confirming={confirmFree}
                  disabled={room.busy}
                  onConfirmingChange={setConfirmFree}
                  onConfirm={() => {
                    setConfirmFree(false);
                    act(room.endMeeting);
                  }}
                  onBookLater={() => navigate('/book?when=later')}
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
 * The confirmation mark: a solid disc with the tick cut clean out of it, so the
 * room's own colour shows through the stroke instead of a second colour sitting
 * on top of it. Lucide paints `circle-check` as a stroked path over the circle,
 * which can be any colour but never transparent — so its geometry is redrawn
 * here behind a mask that punches the tick out.
 */
function CheckedInMark({ className }: { className?: string }) {
  return (
    // The disc lands first and the tick is cut into it a moment later, so the
    // answer reads as something the room did rather than a label that was
    // always there. Spring, not a duration: it should feel like it snapped to.
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 720, damping: 26 }}
    >
      <mask id="checked-in-mark" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        {/* White shows the disc, black hides the stroke under it. */}
        <circle cx="12" cy="12" r="10" fill="white" />
        {/* Lucide's tick, drawn backwards: its own path starts at the long
            arm's top end, which animates as a stroke falling into the corner.
            Reversed (same geometry, opposite direction) it goes short arm
            first, the way the mark is written. */}
        <motion.path
          d="M8 12l2.5 2.5L16 9"
          fill="none"
          stroke="black"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.07, duration: 0.18, ease: 'easeOut' }}
        />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask="url(#checked-in-mark)" />
    </motion.svg>
  );
}

/**
 * Left column of every busy state: the meeting `title` hangs above the state
 * word without moving it.
 */
function BusyHeadline({ instant, title }: { instant: boolean; title?: string }) {
  return (
    <div className={splitLeftClass}>
      {/* Content-sized wrapper: the title hangs off the headline, not the column. */}
      <div className="relative">
        {title && <p className={meetingNameClass}>{title}</p>}
        <motion.h1 {...headlineMotion(instant)} className={headlineClass}>
          Busy
        </motion.h1>
      </div>
    </div>
  );
}

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
  /** Clock time the figure refers to; a full-day reservation has none. */
  at?: string;
  /** Small trailing line, e.g. the meeting that follows without a break. */
  note?: string;
  /** Extra classes for the figure, e.g. a smaller size for a longer value. */
  valueClassName?: string;
}) {
  return (
    <div className={splitRightClass}>
      <div>
        <div className={panelLabelClass}>
          <Icon className="h-[1.15em] w-[1.15em] shrink-0" />
          {label}
        </div>
        <div
          className={cn(
            'mt-[clamp(0.75rem,1.2vw,1.5rem)] text-[clamp(3.25rem,5.8vw,6.5rem)] font-extrabold leading-none tracking-tight',
            valueClassName,
          )}
        >
          {value}
        </div>
        {at && (
          <div className="tabular mt-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(1.75rem,2.8vw,3.25rem)] font-semibold text-white/90">
            at {at}
          </div>
        )}
        {note && (
          <div className="mt-[clamp(0.5rem,0.8vw,1rem)] truncate text-[clamp(1.1rem,1.6vw,1.75rem)] text-white/70">
            {note}
          </div>
        )}
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
 * Footer of a busy room: "Free up the room" and, beside it, a way to reserve
 * a slot after this meeting without freeing anything. A tap on the first one
 * swaps the pair for its confirmation, so the row keeps its shape: the parent
 * dims the screen and shows the "Free up the room?" title while `confirming`.
 *
 * The label says what the tap does to the room, not to the meeting: "End
 * meeting" read as if it would cancel the meeting itself for everyone, which
 * is exactly what someone standing in front of a booked room does not want.
 */
function BusyActions({
  confirming,
  disabled,
  onConfirmingChange,
  onConfirm,
  onBookLater,
}: {
  confirming: boolean;
  disabled: boolean;
  onConfirmingChange: (value: boolean) => void;
  onConfirm: () => void;
  onBookLater: () => void;
}) {
  if (!confirming) {
    return (
      <div className={pairClass}>
        {/* Not dimmed while the booking that made the room busy is still being
            confirmed: the store ignores a tap during those few hundred ms anyway,
            and a button that fades in at 40% and then snaps to full reads as a glitch. */}
        <Button
          size="xl"
          variant="primary"
          className={cn(pairButtonClass, 'disabled:opacity-100')}
          disabled={disabled}
          onClick={() => onConfirmingChange(true)}
        >
          <span className="truncate">Free up the room</span>
        </Button>
        <Button size="xl" variant="outline" className={pairButtonClass} onClick={onBookLater}>
          <CalendarPlus className="h-[1.2em] w-[1.2em] shrink-0" />
          <span className="truncate">Book for later</span>
        </Button>
      </div>
    );
  }
  return (
    <div className={pairClass}>
      <Button
        size="xl"
        variant="primary"
        className={pairButtonClass}
        disabled={disabled}
        onClick={onConfirm}
      >
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
