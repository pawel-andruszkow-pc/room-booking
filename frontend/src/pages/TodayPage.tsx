import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores/StoreContext';
import { useIdleReturn } from '@/hooks/useIdleReturn';
import { PageShell } from '@/components/PageShell';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatRange, formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { CalendarEvent, RoomDay } from '@/types';

const HOUR_MS = 3_600_000;

/**
 * Height of one hour on the scale. Everything else derives from it, so the
 * whole day stretches or shrinks by changing this one number — and a
 * half-hour meeting has to stay tall enough to read a title in.
 */
const HOUR_PX = 96;

/** A rectangle shorter than this gets the compact type scale. */
const COMPACT_PX = 56;

/** Read-only overview of the room's whole day, drawn to a vertical time scale. */
export const TodayPage = observer(function TodayPage() {
  const { day: store, room, clock } = useStores();
  useIdleReturn();

  // Opens on the cached day straight away; the fetch behind it brings any
  // change since the last poll.
  useEffect(() => {
    void store.refresh();
  }, [store]);

  const day = store.day;
  const tz = day?.timezone ?? room.timezone;
  const now = clock.now;

  return (
    <PageShell
      title={day ? `${day.room.name} today` : 'Today'}
      subtitle={day ? formatDate(now, tz) : undefined}
      timezone={tz}
    >
      {!day ? (
        store.error ? (
          <p className="text-3xl text-white/60">Could not load today: {store.error}</p>
        ) : (
          <div className="flex justify-center py-20">
            <Spinner className="h-10 w-10" />
          </div>
        )
      ) : day.events.length === 0 && day.allDay.length === 0 ? (
        <p className="text-3xl text-white/60">No meetings today. The room is free all day.</p>
      ) : (
        <>
          {day.allDay.map((event) => (
            <AllDayBanner key={event.id} event={event} />
          ))}
          <DayTimeline day={day} now={now} tz={tz} />
        </>
      )}
    </PageShell>
  );
});

/**
 * A full-day reservation sits above the scale rather than on it: drawn as a
 * 24-hour block it would push every real meeting into a half-width lane.
 */
function AllDayBanner({ event }: { event: CalendarEvent }) {
  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-white bg-white px-4 py-4 text-ink">
      <span className="min-w-0 flex-1 truncate text-2xl font-semibold">{event.title}</span>
      <span className="shrink-0 text-xl font-bold text-ink/75">All day</span>
    </div>
  );
}

interface Slot {
  event: CalendarEvent;
  startMs: number;
  endMs: number;
  /** Column to draw in, so overlapping bookings do not hide each other. */
  lane: number;
}

/**
 * The day as a proportional scale: full hours are the main unit, half hours
 * the secondary one, and every meeting is a rectangle spanning exactly the
 * time it occupies. Length is the point — a glance shows how much of the day
 * is taken and where the gaps are, which a list of equal-height rows cannot.
 *
 * The scale is the whole day, 00:00 to 23:30, so it is taller than the screen
 * and scrolls; it opens at the current time (see below) rather than at
 * midnight, which is never the part anyone came to read.
 */
function DayTimeline({ day, now, tz }: { day: RoomDay; now: Date; tz: string }) {
  const nowMarker = useRef<HTMLDivElement>(null);

  // A wall tablet is rarely read for the morning it already missed: open the
  // day at the current time instead of at the top of the scale.
  useEffect(() => {
    nowMarker.current?.scrollIntoView({ block: 'center' });
  }, []);

  const slots = layOut(day.events);
  const nowMs = now.getTime();

  // Midnight to midnight in the room's own timezone, which is also how the
  // backend bounds the day — so the scale is 23 or 25 hours long on the days
  // the clocks change, and a booking can never fall outside it.
  const from = new Date(day.dayStart).getTime();
  const to = new Date(day.dayEnd).getTime();
  const hours = Math.round((to - from) / HOUR_MS);
  const height = hours * HOUR_PX;
  const y = (ms: number) => Math.min(height, Math.max(0, ((ms - from) / HOUR_MS) * HOUR_PX));

  const lanes = Math.max(1, ...slots.map((s) => s.lane + 1));
  const marks = Array.from({ length: hours }, (_, i) => from + i * HOUR_MS);
  const nowVisible = nowMs >= from && nowMs <= to;

  return (
    <div className="flex" style={{ height }}>
      {/* Gutter: full hours are the main unit, half hours the secondary one. */}
      <div className="relative w-24 shrink-0">
        {marks.map((ms, i) => (
          <div key={ms}>
            <span
              className="tabular absolute right-4 -translate-y-1/2 text-xl font-bold text-white/80"
              style={{ top: i * HOUR_PX }}
            >
              {formatTime(new Date(ms), tz)}
            </span>
            <span
              className="tabular absolute right-4 -translate-y-1/2 text-sm text-white/35"
              style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
            >
              {formatTime(new Date(ms + HOUR_MS / 2), tz)}
            </span>
          </div>
        ))}
      </div>

      <div className="relative min-w-0 flex-1 border-l border-white/20">
        {/* Grid: a solid line on every hour, a faint one on every half hour. */}
        {marks.map((ms, i) => (
          <div key={ms}>
            <span className="absolute inset-x-0 h-px bg-white/15" style={{ top: i * HOUR_PX }} />
            <span
              className="absolute inset-x-0 h-px bg-white/[0.06]"
              style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
            />
          </div>
        ))}
        <span className="absolute inset-x-0 bottom-0 h-px bg-white/15" />

        {slots.map((slot) => (
          <MeetingBlock
            key={slot.event.id}
            slot={slot}
            top={y(slot.startMs)}
            height={y(slot.endMs) - y(slot.startMs)}
            lanes={lanes}
            nowMs={nowMs}
            tz={tz}
          />
        ))}

        {/* Amber, not white: the marker crosses the meeting in progress, and
            that block is white — a white line would vanish inside it. */}
        {nowVisible && (
          <div
            ref={nowMarker}
            className="absolute inset-x-0 z-10 flex -translate-y-1/2 items-center"
            style={{ top: y(nowMs) }}
          >
            <span className="h-3.5 w-3.5 shrink-0 -translate-x-1/2 rounded-full bg-attention" />
            <span className="h-0.5 flex-1 bg-attention" />
          </div>
        )}
      </div>
    </div>
  );
}

/** One meeting, drawn to the length of its slot. */
function MeetingBlock({
  slot,
  top,
  height,
  lanes,
  nowMs,
  tz,
}: {
  slot: Slot;
  top: number;
  height: number;
  lanes: number;
  nowMs: number;
  tz: string;
}) {
  const { event, startMs, endMs, lane } = slot;
  // Meetings that are over are drawn like any other: the marker says where the
  // day stands, so dimming them only made the morning harder to read.
  const current = startMs <= nowMs && endMs > nowMs;
  // 2px off each end, so meetings that touch never read as one block. Very
  // short bookings keep a floor height instead of collapsing to a sliver.
  const boxHeight = Math.max(30, height - 4);
  const compact = boxHeight < COMPACT_PX;

  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-xl border px-4',
        current ? 'border-white bg-white text-ink' : 'border-white/10 bg-ink-3',
      )}
      style={{
        top: top + 2,
        height: boxHeight,
        left: `calc(${(lane / lanes) * 100}% + 0.75rem)`,
        width: `calc(${100 / lanes}% - 0.75rem)`,
      }}
    >
      <div className="flex h-full items-center gap-4">
        <span
          className={cn('min-w-0 flex-1 truncate font-semibold', compact ? 'text-lg' : 'text-2xl')}
        >
          {event.title}
        </span>
        <span
          className={cn(
            'tabular shrink-0 font-bold',
            compact ? 'text-base' : 'text-xl',
            current ? 'text-ink/75' : 'text-white/80',
          )}
        >
          {formatRange(new Date(startMs), new Date(endMs), tz)}
        </span>
      </div>
    </div>
  );
}

/**
 * Assigns each meeting a column. A room is normally booked back to back, so
 * that is one column — but a double booking must not hide the meeting beneath
 * it, so overlapping slots get a column each.
 */
function layOut(events: CalendarEvent[]): Slot[] {
  const laneEnds: number[] = [];
  return events
    .map((event) => ({
      event,
      startMs: new Date(event.start).getTime(),
      endMs: new Date(event.end).getTime(),
    }))
    .sort((a, b) => a.startMs - b.startMs)
    .map((slot) => {
      const free = laneEnds.findIndex((end) => end <= slot.startMs);
      const lane = free === -1 ? laneEnds.length : free;
      laneEnds[lane] = slot.endMs;
      return { ...slot, lane };
    });
}
