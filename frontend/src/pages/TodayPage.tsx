import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores/StoreContext';
import { api } from '@/lib/api';
import { PageShell } from '@/components/PageShell';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatRange, formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { RoomDay } from '@/types';

/** Hours shown on the day strip. Meetings outside this window are still listed. */
const DAY_FROM = 7;
const DAY_TO = 20;

/** Read-only overview of the room's whole day: a time strip plus the meeting list. */
export const TodayPage = observer(function TodayPage() {
  const { device, room, clock, toast } = useStores();
  const [day, setDay] = useState<RoomDay | null>(null);

  useEffect(() => {
    if (!device.roomId) return;
    const controller = new AbortController();
    api.rooms
      .today(device.roomId, controller.signal)
      .then(setDay)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') toast.error('Could not load today', err.message);
      });
    return () => controller.abort();
  }, [device.roomId, toast]);

  const tz = day?.timezone ?? room.timezone;
  const now = clock.now;

  return (
    <PageShell
      title={day ? `${day.room.name} today` : 'Today'}
      subtitle={day ? formatDate(now, tz) : undefined}
      timezone={tz}
    >
      {!day ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <div className="space-y-12">
          <DayStrip day={day} now={now} />

          {day.events.length === 0 ? (
            <p className="text-3xl text-white/60">No meetings today. The room is free all day.</p>
          ) : (
            <ol className="grid grid-cols-2 gap-x-12 gap-y-3">
              {day.events.map((event) => {
                const start = new Date(event.start);
                const end = new Date(event.end);
                const past = end <= now;
                const current = start <= now && end > now;
                return (
                  <li
                    key={event.id}
                    className={cn(
                      'flex items-baseline gap-6 rounded-2xl px-6 py-4',
                      current ? 'bg-white text-ink' : 'bg-white/5',
                      past && 'opacity-40',
                    )}
                  >
                    <span className={cn('tabular w-44 shrink-0 text-xl', current ? 'text-ink/60' : 'text-white/60')}>
                      {formatRange(event.start, event.end, tz)}
                    </span>
                    <span className="truncate text-2xl font-semibold">{event.title}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </PageShell>
  );
});

/** Horizontal strip of the working day with busy blocks and a "now" marker. */
function DayStrip({ day, now }: { day: RoomDay; now: Date }) {
  const dayStart = new Date(day.dayStart).getTime();
  const from = dayStart + DAY_FROM * 3600_000;
  const to = dayStart + DAY_TO * 3600_000;
  const span = to - from;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - from) / span) * 100));
  const hours = Array.from({ length: DAY_TO - DAY_FROM + 1 }, (_, i) => DAY_FROM + i);
  const nowPct = pct(now.getTime());

  return (
    <div>
      <div className="relative h-20 rounded-2xl bg-white/5">
        {day.events.map((event) => {
          const s = new Date(event.start).getTime();
          const e = new Date(event.end).getTime();
          if (e <= from || s >= to) return null;
          const left = pct(s);
          const width = Math.max(0.6, pct(e) - left);
          const past = e <= now.getTime();
          return (
            <div
              key={event.id}
              className={cn(
                'absolute top-2 bottom-2 overflow-hidden rounded-xl bg-busy px-3 py-1 text-sm font-semibold leading-tight',
                past && 'opacity-40',
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${event.title} ${formatRange(event.start, event.end, day.timezone)}`}
            >
              <span className="line-clamp-2">{event.title}</span>
            </div>
          );
        })}
        {nowPct > 0 && nowPct < 100 && (
          <div className="absolute -top-2 -bottom-2 w-1 rounded bg-white" style={{ left: `${nowPct}%` }}>
            <span className="tabular absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold">
              {formatTime(now, day.timezone)}
            </span>
          </div>
        )}
      </div>
      <div className="relative mt-2 h-6 text-sm text-white/50">
        {hours.map((h) => (
          <span
            key={h}
            className="tabular absolute -translate-x-1/2"
            style={{ left: `${((h - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100}%` }}
          >
            {h.toString().padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}
