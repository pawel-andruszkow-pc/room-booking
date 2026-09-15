import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import * as Slider from '@radix-ui/react-slider';
import { Check, ChevronLeft, ChevronRight, Clock3, Minus, Plus, Zap } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { IDLE_RETURN_MS, useIdleReturn } from '@/hooks/useIdleReturn';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  DEFAULT_EXTEND_MINUTES,
  DEFAULT_MINUTES,
  EXTEND_MINUTES,
  QUICK_MINUTES,
} from '@/lib/booking';
import { formatDuration, formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { roomIsFree, type CalendarEvent } from '@/types';

/** One unit on the time picker. Everything on this page counts in these. */
const UNIT_MINUTES = 5;
const UNIT_MS = UNIT_MINUTES * 60_000;
const HOUR_UNITS = 60 / UNIT_MINUTES;

/**
 * The picker opens on the working day, 08:00 – 17:00, and the arrows step it
 * an hour either way for anything outside those hours. Showing all 24 would
 * squeeze a 30-minute booking — the common case — into two percent of the
 * track, with both pins sitting on top of each other.
 */
const WINDOW_FROM_HOUR = 8;
const WINDOW_TO_HOUR = 17;
const WINDOW_UNITS = (WINDOW_TO_HOUR - WINDOW_FROM_HOUR) * HOUR_UNITS;

const chipOn = 'bg-emerald-400 text-ink shadow-lg shadow-emerald-900/30';
const chipOff = 'bg-white/10 hover:bg-white/15';
const chipClass =
  'rounded-2xl font-bold transition-[background-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-25';

/** The slider handles; the ring turns to the warning colour when the pin sits in a meeting. */
const thumbClass = 'block h-14 w-14 rounded-full bg-white shadow-lg ring-4 focus:outline-none';
const thumbOk = 'ring-emerald-400/30';
const thumbWarn = 'ring-attention/50';

/** The −5 / +5 nudges beside a pin, and the arrows either side of the track. */
const nudgeClass =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-[transform,background-color] duration-150 hover:bg-white/15 active:scale-90 disabled:cursor-not-allowed disabled:opacity-20';

/**
 * The action row belongs to the page, not to the views: it stays at the bottom
 * and only its labels change when the view above it is swapped.
 */
const actionsClass = 'mt-auto flex shrink-0 gap-4 pt-2';

type Mode = 'quick' | 'time';

/** What a view asks the page to book. */
type Booking = { startAt: Date; minutes: number; immediate: boolean };

/**
 * What the confirm button offers right now. Each view reports its own, so the
 * button can live outside the views — it changes label only, never position,
 * while the view under it animates. `book` is null when nothing can be booked.
 */
type Proposal = { label: string; book: (() => Booking) | null };

/**
 * Two ways to take the room, one at a time:
 *
 *  - **Quick booking** — a length, starting now. Two taps, which is what a
 *    walk-in standing at the door needs.
 *  - **Pick a time** — a from/to range on the day, five minutes per unit, for
 *    a meeting that starts later.
 *
 * A booking that starts now is sent as a walk-in (checked in on the spot); one
 * that starts later is a reservation, and goes through the usual presence
 * prompt when it begins.
 *
 * Opened with `?when=later` the page starts on the time picker, which is the
 * only view that makes sense for a slot later in the day.
 *
 * `?when=extend` is a third, narrower job on the same page: the meeting in the
 * room runs longer. It is the quick view alone — a length, no start to choose
 * — bounded by the gap before the next meeting instead of by what is free now.
 */
export const BookPage = observer(function BookPage() {
  const { clock, device, room, toast } = useStores();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const when = searchParams.get('when');
  /** Extending the running meeting rather than taking the room for a new one. */
  const extending = when === 'extend';
  const [mode, setMode] = useState<Mode>(() => (when === 'later' ? 'time' : 'quick'));
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  /** Set the moment the user confirms; freezes the page while it fades out. */
  const submitted = useRef(false);
  const redirected = useRef(false);

  // A picker left mid-way should not greet the next person; a request in
  // flight finishes (and navigates) on its own, so the countdown pauses then.
  useIdleReturn(IDLE_RETURN_MS, !busy);

  useEffect(() => {
    if (device.roomId) room.start(device.roomId);
  }, [device.roomId, room]);

  const status = room.status;
  const tz = room.timezone;
  // Extending is bounded by the gap after the meeting, not by what is free now.
  const available = extending ? room.extendableMinutes : room.availableMinutes;

  // Quick booking is "from now": if someone else took the room while it was
  // open, go back — once. The time picker draws the running meeting as taken
  // and offers the gaps after it, so a busy room is no reason to leave it.
  // Our own booking (optimistic or confirmed) never counts as "taken".
  useEffect(() => {
    if (!status || extending || roomIsFree(status.state) || mode !== 'quick') return;
    if (submitted.current || redirected.current) return;
    if (room.busy || room.optimistic) return;
    if (status.current && room.isOwnBooking(status.current.id)) return;
    redirected.current = true;
    toast.info('Room is no longer free');
    navigate('/', { replace: true });
  }, [status, extending, mode, room, navigate, toast]);

  // The mirror image for extending: the meeting has to still be running, and
  // the gap it would grow into still has to be there. Both can go away while
  // the page is open — the meeting ends, or someone books the slot after it.
  useEffect(() => {
    if (!status || !extending || room.canExtend) return;
    if (submitted.current || redirected.current) return;
    if (room.busy || room.optimistic) return;
    redirected.current = true;
    toast.info(
      roomIsFree(status.state)
        ? 'The meeting has ended'
        : 'This meeting can no longer be extended',
    );
    navigate('/', { replace: true });
  }, [status, extending, room, navigate, toast]);

  const day = useMemo(() => (status ? dayBounds(new Date(status.now), tz) : null), [status, tz]);

  const book = ({ startAt, minutes, immediate }: Booking) => {
    if (busy) return;
    setBusy(true);
    submitted.current = true;
    if (extending) {
      // Optimistic like a walk-in: the room screen already shows the later end
      // by the time it comes back, so the confirmation names the new time
      // rather than repeating what the screen says.
      const until = room.current && new Date(+new Date(room.current.end) + minutes * 60_000);
      room
        .extendMeeting(minutes)
        .then(() => toast.success(until ? `Extended until ${formatTime(until, tz)}` : 'Extended'))
        .catch((err: Error) => toast.error('Could not extend the meeting', err.message));
      navigate('/', { replace: true });
      return;
    }
    if (immediate) {
      // Optimistic: the room screen flips to busy right away, so there is
      // nothing to wait for here. A failure rolls it back and reports there.
      room
        .book(minutes)
        .catch((err: Error) => toast.error('Booking failed, room is still free', err.message));
      navigate('/', { replace: true });
      return;
    }
    room
      .reserve(startAt, minutes)
      .then(() => {
        toast.success(
          `Reserved ${formatTime(startAt, tz)} – ${formatTime(new Date(+startAt + minutes * 60_000), tz)}`,
        );
        navigate('/', { replace: true });
      })
      .catch((err: Error) => {
        toast.error('Could not reserve the room', err.message);
        submitted.current = false;
        setBusy(false);
      });
  };

  // Nothing to book "now" while a meeting is running, so the way over to the
  // quick view is not offered then.
  // "Busy soon" counts: the room really is free, and availableMinutes already
  // caps what can be taken before the meeting that is about to start.
  const canBookNow = status !== null && roomIsFree(status.state);
  /** On the time picker of a busy room: when the first gap can open. */
  const busyHint =
    !canBookNow && room.busyUntil ? `Busy until ${formatTime(room.busyUntil, tz)} · ` : '';

  const actions = (
    <div className={actionsClass}>
      {canBookNow && (
        <Button
          variant="secondary"
          size="xl"
          className="min-w-0 flex-1 basis-0"
          disabled={busy}
          onClick={() => setMode(mode === 'quick' ? 'time' : 'quick')}
        >
          {mode === 'quick' ? (
            <>
              <Clock3 className="h-8 w-8" /> Pick a time
            </>
          ) : (
            <>
              <Zap className="h-8 w-8" /> Quick booking
            </>
          )}
        </Button>
      )}
      <Button
        size="xl"
        variant="success"
        className="min-w-0 flex-1 basis-0"
        disabled={busy || !proposal?.book}
        aria-busy={busy}
        onClick={() => proposal?.book && book(proposal.book())}
      >
        {busy ? <Spinner className="h-8 w-8" /> : <Check className="h-9 w-9" />}
        {proposal?.label ?? 'Pick a length'}
      </Button>
    </div>
  );

  return (
    <PageShell
      title={extending ? 'Extend reservation' : `Book ${status?.room.name ?? 'room'}`}
      subtitle={
        !status
          ? undefined
          : submitted.current
            ? extending
              ? 'Extending…'
              : 'Booking…'
            : extending
              ? `${status.current ? `“${status.current.title}” runs` : 'Runs'} until ${formatTime(status.current?.end ?? status.now, tz)} · up to ${formatDuration(available)} more`
              : mode === 'quick'
                ? available >= UNIT_MINUTES
                  ? `Free for ${formatDuration(available)}${status.freeUntil && room.next ? ` · next meeting at ${formatTime(status.freeUntil, tz)}` : ''}`
                  : 'The room is free for less than 5 minutes'
                : `${busyHint}Drag the pins, or nudge them 5 minutes at a time`
      }
      timezone={tz}
    >
      {!status || day === null ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Same timing as a route change (see PageTransition): the old view
              is dropped on the tap and the new one fades in, compositor-only.
              The action row below is not part of it: it stays put and only
              its labels change. */}
          <motion.div
            key={mode}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } }}
          >
            {mode === 'quick' ? (
              <QuickBooking
                available={available}
                extending={extending}
                busy={busy}
                onProposal={setProposal}
              />
            ) : (
              <TimePicker
                dayStart={day.start}
                dayEnd={day.end}
                nowMs={clock.now.getTime()}
                events={status.events}
                maxMinutes={status.settings.maxBookingMinutes}
                tz={tz}
                busy={busy}
                onProposal={setProposal}
              />
            )}
          </motion.div>
          {actions}
        </div>
      )}
    </PageShell>
  );
});

/** Predefined lengths — starting now, or added to the meeting already running. */
const QuickBooking = observer(function QuickBooking({
  available,
  extending,
  busy,
  onProposal,
}: {
  available: number;
  /** Adding to the running meeting rather than starting a new one. */
  extending?: boolean;
  busy: boolean;
  onProposal: (proposal: Proposal) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const slots = extending ? EXTEND_MINUTES : QUICK_MINUTES;
  const preferred = extending ? DEFAULT_EXTEND_MINUTES : DEFAULT_MINUTES;
  const fits = (m: number) => m <= available;

  // Derived rather than stored, so a choice that stops fitting as the next
  // meeting comes closer simply falls away instead of needing a correction.
  // With little time left the longest slot that still fits stands in for the
  // default, so the room can always be taken in one more tap.
  const fallback = slots.filter(fits).pop() ?? null;
  const minutes =
    picked !== null && fits(picked) ? picked : fits(preferred) ? preferred : fallback;

  // The start is taken at the tap, not here: a tile picked a while ago still
  // books "from now".
  useEffect(() => {
    onProposal(
      minutes === null
        ? { label: extending ? 'Pick how much longer' : 'Pick a length', book: null }
        : {
            label: extending
              ? `Extend by ${formatDuration(minutes)}`
              : `Book now for ${formatDuration(minutes)}`,
            book: () => ({ startAt: new Date(), minutes, immediate: true }),
          },
    );
  }, [minutes, extending, onProposal]);

  return (
    // The header is a fixed height and the actions sit at the bottom; the
    // tiles take the middle and the space above and below them is whatever is
    // left, so the same layout fits a 10" tablet and a laptop window without
    // either growing a scrollbar.
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center py-[clamp(1rem,4vh,3rem)]">
        <div className="grid w-full grid-cols-3 gap-6">
          {slots.map((m) => {
            const slotFits = fits(m);
            return (
              <button
                key={m}
                type="button"
                disabled={busy || !slotFits}
                onClick={() => setPicked(m)}
                className={cn(
                  chipClass,
                  'flex h-[clamp(6.5rem,17vh,10rem)] flex-col items-center justify-center gap-2 text-4xl',
                  // Unavailable slots keep enough contrast to read the reason;
                  // dimming them to nothing would hide the label with them.
                  minutes === m ? chipOn : slotFits ? chipOff : 'bg-white/5 text-white/40',
                  'disabled:opacity-100',
                  busy && 'opacity-40',
                )}
              >
                {formatDuration(m)}
                {!slotFits && (
                  <span className="text-lg font-semibold text-white/50">Not available</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/**
 * A from/to range on the day, counted in units from midnight. Both the
 * meetings already in the calendar and the part of the day that is over are
 * drawn as taken. The pins move freely over the meetings — stopping them at
 * the edge of a gap made a pin feel stuck for no visible reason — but a
 * selection that runs into one is shown as a warning and cannot be booked.
 * Only the past is a hard stop: a start behind the clock simply means "now".
 */
function TimePicker({
  dayStart,
  dayEnd,
  nowMs,
  events,
  maxMinutes,
  tz,
  busy,
  onProposal,
}: {
  dayStart: number;
  dayEnd: number;
  nowMs: number;
  events: CalendarEvent[];
  /** Null: only the next meeting and the end of the day bound a booking. */
  maxMinutes: number | null;
  tz: string;
  busy: boolean;
  onProposal: (proposal: Proposal) => void;
}) {
  const total = Math.max(1, Math.floor((dayEnd - dayStart) / UNIT_MS));
  const maxUnits = maxMinutes === null ? total : Math.max(1, Math.floor(maxMinutes / UNIT_MINUTES));
  /** The next unit that can still be booked; everything before it is over. */
  const nowUnit = Math.min(total, Math.max(0, Math.ceil((nowMs - dayStart) / UNIT_MS)));

  /** Today's meetings as unit spans, in day order. */
  const meetings = useMemo(
    () =>
      events
        .map((e) => ({
          from: Math.max(0, Math.floor((+new Date(e.start) - dayStart) / UNIT_MS)),
          to: Math.min(total, Math.ceil((+new Date(e.end) - dayStart) / UNIT_MS)),
          title: e.title,
        }))
        .filter((m) => m.to > m.from)
        .sort((a, b) => a.from - b.from),
    [events, dayStart, total],
  );

  /** Drawn as taken: the part of the day that has passed, then every meeting. */
  const blocked = useMemo(() => {
    const spans = meetings.map((m): [number, number] => [m.from, m.to]);
    return nowUnit > 0 ? [[0, nowUnit] as [number, number], ...spans] : spans;
  }, [meetings, nowUnit]);

  const inMeeting = (unit: number) => meetings.some((m) => unit >= m.from && unit < m.to);
  /** Start of the first meeting at or after `unit`, or the end of the day. */
  const nextMeeting = (unit: number) => meetings.find((m) => m.from >= unit)?.from ?? total;

  const firstFree = useMemo(() => {
    for (let u = nowUnit; u < total; u += 1) {
      if (!meetings.some((m) => u >= m.from && u < m.to)) return u;
    }
    return null;
  }, [meetings, total, nowUnit]);

  // The default selection is placed in a gap; only a move made by hand can
  // run into a meeting.
  const [range, setRange] = useState<[number, number]>(() => {
    const start = firstFree ?? nowUnit;
    const limit = Math.min(nextMeeting(start), start + maxUnits, total);
    return [start, Math.min(limit, start + DEFAULT_MINUTES / UNIT_MINUTES)];
  });
  const [from, to] = range;

  /** Leftmost unit on the track: the working day, unless now falls outside it. */
  const lastWindow = Math.max(0, total - WINDOW_UNITS);
  const [windowStart, setWindowStart] = useState(() => {
    const working = Math.min(WINDOW_FROM_HOUR * HOUR_UNITS, lastWindow);
    if (nowUnit >= working && nowUnit <= working + WINDOW_UNITS) return working;
    return Math.min(Math.max(nowUnit - HOUR_UNITS, 0), lastWindow);
  });
  const windowEnd = Math.min(windowStart + WINDOW_UNITS, total);

  /** How far the end pin may go with the current start. */
  const limit = Math.min(from + maxUnits, total);

  // Time passing never invalidates the selection: once the start is at or
  // behind the clock it simply means "now", which is what a walk-in wants.
  const immediate = from <= nowUnit;
  const startAt = immediate ? new Date(nowMs) : new Date(dayStart + from * UNIT_MS);
  const endAt = new Date(dayStart + to * UNIT_MS);
  const minutes = Math.max(0, Math.round((+endAt - +startAt) / 60_000));

  const setFrom = (next: number) => {
    const clamped = Math.min(Math.max(nowUnit, next), total - 1);
    const end = Math.min(to, clamped + maxUnits, total);
    setRange([clamped, Math.max(end, clamped + 1)]);
  };

  const setTo = (next: number) => {
    setRange([from, Math.min(Math.max(next, from + 1), from + maxUnits, total)]);
  };

  /**
   * Meetings the selection runs into. The pin standing inside one is the one
   * shown as a warning; a selection that swallows a meeting whole flags both.
   */
  const clash = meetings.find((m) => m.from < to && m.to > from) ?? null;
  const fromClash = clash !== null && inMeeting(from);
  const toClash = clash !== null && inMeeting(to - 1);
  const bothClash = clash !== null && !fromClash && !toClash;

  /**
   * Radix hands back both values; work out which pin the user moved.
   *
   * Committed synchronously: React files pointer moves as low-priority
   * "continuous" input and may leave the re-render for a later frame, which
   * on a tablet shows as the pin trailing the finger. The tree under here is
   * small, so flushing it inside the event is cheaper than the lag.
   */
  const onSlide = ([nextFrom, nextTo]: number[]) => {
    flushSync(() => {
      if (nextFrom !== from) setFrom(nextFrom);
      else setTo(nextTo);
    });
  };

  /**
   * Moves the visible hours, taking the selection along when it would other-
   * wise sit off the track — a slider whose value is outside its own range is
   * what makes a pin jump on the next touch.
   */
  const shiftWindow = (delta: number) => {
    const start = Math.min(Math.max(windowStart + delta, 0), lastWindow);
    setWindowStart(start);
    const end = Math.min(start + WINDOW_UNITS, total);
    if (from >= start && to <= end) return;
    const first = Math.max(from, start, nowUnit);
    if (first >= end) return;
    const length = Math.max(1, to - from);
    setRange([first, Math.min(first + length, first + maxUnits, end)]);
  };

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();
  const none = firstFree === null;
  const clashTitle = clash?.title ?? null;
  useEffect(() => {
    if (none || minutes < UNIT_MINUTES) {
      onProposal({ label: none ? 'No free time' : 'Pick a time', book: null });
      return;
    }
    if (clashTitle !== null) {
      onProposal({ label: 'Overlaps a meeting', book: null });
      return;
    }
    const start = new Date(startMs);
    onProposal({
      label: immediate
        ? `Book now for ${formatDuration(minutes)}`
        : `Reserve ${formatTime(start, tz)} – ${formatTime(new Date(endMs), tz)}`,
      book: () => ({ startAt: start, minutes, immediate }),
    });
  }, [none, clashTitle, immediate, minutes, startMs, endMs, tz, onProposal]);

  if (none) {
    return <p className="text-3xl text-white/60">No free time left today.</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center gap-12 py-[clamp(1rem,4vh,3rem)]">
        <div className="flex items-end justify-center gap-[clamp(1.5rem,4vw,5rem)]">
          <Pin
            label="From"
            value={immediate ? 'Now' : formatTime(startAt, tz)}
            warning={fromClash || bothClash}
            onMinus={() => setFrom(from - 1)}
            onPlus={() => setFrom(from + 1)}
            minusDisabled={busy || from <= nowUnit}
            plusDisabled={busy || from + 1 >= to}
          />
          <div className="w-60 shrink-0 pb-6 text-center">
            <div className="text-lg uppercase tracking-[0.2em] text-white/50">Duration</div>
            <div className="tabular mt-1 whitespace-nowrap text-4xl font-extrabold text-emerald-400">
              {formatDuration(minutes)}
            </div>
          </div>
          <Pin
            label="To"
            value={formatTime(endAt, tz)}
            warning={toClash || bothClash}
            onMinus={() => setTo(to - 1)}
            onPlus={() => setTo(to + 1)}
            minusDisabled={busy || to - 1 <= from}
            plusDisabled={busy || to + 1 > limit}
          />
        </div>

        {/* Always present, so the track does not move when a warning appears. */}
        <p
          className="-my-6 h-8 text-center text-xl font-semibold text-attention"
          aria-live="polite"
        >
          {clash ? `Overlaps “${clash.title}”` : ''}
        </p>

        <div className="flex items-start gap-4">
          <button
            type="button"
            className={cn(nudgeClass, 'mt-1')}
            disabled={busy || windowStart === 0}
            onClick={() => shiftWindow(-HOUR_UNITS)}
            aria-label="Earlier hours"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>

          <div className="min-w-0 flex-1">
            <Slider.Root
              className="relative flex h-16 w-full touch-none select-none items-center"
              min={windowStart}
              max={windowEnd}
              step={1}
              minStepsBetweenThumbs={1}
              value={range}
              disabled={busy}
              onValueChange={onSlide}
            >
              <Slider.Track className="relative h-6 grow overflow-hidden rounded-full bg-white/10">
                <BlockedSpans blocked={blocked} from={windowStart} to={windowEnd} />
                <Slider.Range
                  className={cn(
                    'absolute h-full transition-colors duration-400',
                    clash ? 'bg-attention' : 'bg-emerald-400',
                  )}
                />
              </Slider.Track>
              <Slider.Thumb
                className={cn(thumbClass, fromClash || bothClash ? thumbWarn : thumbOk)}
                aria-label="From"
              />
              <Slider.Thumb
                className={cn(thumbClass, toClash || bothClash ? thumbWarn : thumbOk)}
                aria-label="To"
              />
            </Slider.Root>
            <HourTicks dayStart={dayStart} from={windowStart} to={windowEnd} tz={tz} />
          </div>

          <button
            type="button"
            className={cn(nudgeClass, 'mt-1')}
            disabled={busy || windowStart >= lastWindow}
            onClick={() => shiftWindow(HOUR_UNITS)}
            aria-label="Later hours"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** One end of the range: the time, with −5 / +5 either side of it. */
function Pin({
  label,
  value,
  warning = false,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: string;
  /** The time sits inside a meeting: shown in the warning colour. */
  warning?: boolean;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-lg uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div
        className={cn(
          'tabular mt-1 text-6xl font-extrabold transition-colors duration-400',
          warning && 'text-attention',
        )}
      >
        {value}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          className={nudgeClass}
          disabled={minusDisabled}
          onClick={onMinus}
          aria-label={`${label} minus ${UNIT_MINUTES} minutes`}
        >
          <Minus className="h-7 w-7" />
        </button>
        <span className="w-16 text-base text-white/50">{UNIT_MINUTES} min</span>
        <button
          type="button"
          className={nudgeClass}
          disabled={plusDisabled}
          onClick={onPlus}
          aria-label={`${label} plus ${UNIT_MINUTES} minutes`}
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

/** Taken parts of the track. Only the window moves these, never a drag. */
const BlockedSpans = memo(function BlockedSpans({
  blocked,
  from,
  to,
}: {
  blocked: Array<[number, number]>;
  from: number;
  to: number;
}) {
  return blocked.map(([f, t]) => (
    <span
      key={`${f}-${t}`}
      className="absolute inset-y-0 bg-white/25"
      style={{ left: `${pct(f, from, to)}%`, width: `${pct(t, from, to) - pct(f, from, to)}%` }}
    />
  ));
});

/** Half hours under the visible part of the track; whole hours stand out. */
const HourTicks = memo(function HourTicks({
  dayStart,
  from,
  to,
  tz,
}: {
  dayStart: number;
  from: number;
  to: number;
  tz: string;
}) {
  const ticks = useMemo(() => {
    const halfHour = 30 * 60_000;
    const out: number[] = [];
    for (
      let t = Math.ceil((dayStart + from * UNIT_MS) / halfHour) * halfHour;
      t <= dayStart + to * UNIT_MS;
      t += halfHour
    ) {
      out.push(t);
    }
    return out;
  }, [dayStart, from, to]);

  return (
    <div className="relative mt-2 h-6">
      {ticks.map((t) => (
        <span
          key={t}
          className={cn(
            'tabular absolute -translate-x-1/2 text-sm',
            new Date(t).getMinutes() === 0 ? 'font-bold text-white/60' : 'text-white/30',
          )}
          style={{ left: `${pct((t - dayStart) / UNIT_MS, from, to)}%` }}
        >
          {formatTime(new Date(t), tz)}
        </span>
      ))}
    </div>
  );
});

/** Where a unit sits on the visible window, in percent. */
function pct(unit: number, from: number, to: number): number {
  return Math.min(100, Math.max(0, ((unit - from) / (to - from)) * 100));
}

/**
 * Midnight either side of the room's day. Derived from the server's clock and
 * the room timezone, so a tablet set to the wrong zone still starts and stops
 * at the right hour.
 */
function dayBounds(now: Date, tz: string): { start: number; end: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second');
  return {
    start: now.getTime() - secondsIntoDay * 1000,
    end: now.getTime() + (86_400 - secondsIntoDay) * 1000,
  };
}

function safeTz(tz: string): string | undefined {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}
