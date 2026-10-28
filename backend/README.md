# Backend — mocking UI states

How to put the room screen into a given state (busy, free, presence prompt, …)
while developing. Setup, configuration and architecture are in the
[root README](../README.md).

There are two ways, depending on whether you need the real backend:

| | Frontend mock (`?mock`) | Local calendar (this backend) |
| --- | --- | --- |
| Needs backend + Postgres | no | yes |
| Uses the real status logic | a copy of it (`frontend/src/dev/mockApi.ts`) | yes (`BookingsService`) |
| Survives a reload | no — resets to the scenario | yes — it's in the database |
| Good for | layout, themes, animations | API behaviour, cron release, several tablets |

## 1. Frontend only: `?mock`

No backend needed. With `pnpm dev` running in `frontend/`, open:

```
http://localhost:3021/?mock=<scenario>
```

| Scenario | Screen |
| --- | --- |
| `busy` (default) | meeting in progress (checked in), another later |
| `check-in` | meeting just started → "Is this meeting taking place?" |
| `soon` | free, next meeting in 4 min (`busy-soon`) |
| `free` | free, next meeting in an hour |
| `all-day` | all-day event |

- Every `/api` call is answered in the browser, so taps (book, extend, end,
  check in) work; a reload resets the scenario.
- The choice sticks for the tab; `?mock=off` turns it off.
- Only on `localhost` / `127.0.0.1` — a tablet reaching the dev server over the
  LAN never gets fake data — and never in a production build.
- Add `?template=<season>` to force a seasonal look with matching room and
  meeting names: `grandma`, `paczki`, `valentines`, `womens-day`, `spring`,
  `april-fools`, `easter`, `kids`, `coders-day`, `halloween`, `santa`,
  `christmas`. Example:
  `http://localhost:3021/?mock=busy&template=halloween`.
- `?template=off` drops the forced season and goes back to the calendar, so
  during a real season (e.g. Halloween week) you still see that theme. For no
  theme at all use `?theme=none` (and `?theme=auto` to undo it).

## 2. Real backend: local calendar provider

With `CALENDAR_PROVIDER=local` (the default in `.env.example`) events live in
the `local_events` table instead of Google Calendar, so you can shape any state
by writing rows.

### Seeded demo

```bash
pnpm seed              # demo meetings around "now"
pnpm seed -- --reset   # also wipe rooms, devices and check-ins first
```

| Room | State after seeding |
| --- | --- |
| Yellow | busy (started 20 min ago), more meetings later |
| Violet | free, next meeting in 45 min |
| Palmiarnia | meeting started 2 min ago → presence prompt |

Meetings are placed relative to the moment you run the seed, so re-run it when
they have drifted (e.g. Palmiarnia's prompt expires after the check-in window
and the room gets released).

### Custom events via the API

`POST /api/calendar/local/events` (admin PIN, local provider only) adds one
event. `calendarId` is the room's calendar id (`yellow@local`, … — see
**Admin → Rooms**):

```bash
curl -u admin:change-me -H 'X-Admin-Pin: 0000' -H 'Content-Type: application/json' \
  http://localhost:3020/api/calendar/local/events \
  -d '{"calendarId":"violet@local","title":"Standup","start":"2026-10-27T10:00:00+01:00","end":"2026-10-27T10:30:00+01:00"}'
```

Optional fields: `description`, `isAllDay` (then `start`/`end` should bound the day).

### Custom events via SQL

Easier for times relative to now. Columns are camelCase, so quote them:

```bash
docker exec -it room-booking-db psql -U roombooking roombooking
```

```sql
-- Start from an empty day in one room
DELETE FROM local_events WHERE "calendarId" = 'violet@local';
DELETE FROM check_ins WHERE "roomId" = (SELECT id FROM rooms WHERE "calendarId" = 'violet@local');

-- Then add the events for the state you want (see the table below), e.g. busy:
INSERT INTO local_events ("calendarId", title, "startsAt", "endsAt")
VALUES ('violet@local', 'Design sync', now() - interval '20 min', now() + interval '40 min');
```

The tablet picks changes up on its next refresh (within `WATCH_INTERVAL_SECONDS`,
5 s by default).

### Which events give which state

`GET /api/rooms/:id/status` derives the state from today's events and the
`check_ins` table (`backend/src/bookings/bookings.service.ts`):

| State | Events to create |
| --- | --- |
| `free` | none, or the next one starts in more than 5 min |
| `busy-soon` | next meeting starts within 5 min |
| `awaiting-check-in` | a meeting that started less than `checkInMinutes` (10) ago, no confirmation |
| `busy` | a meeting that started more than `checkInMinutes` ago (a tablet seeing it for the first time assumes it's on), or one confirmed with **Yes** / booked on the tablet |
| all-day busy | one event with `"isAllDay" = true`, `startsAt`/`endsAt` = midnight to midnight |
| back-to-back | two meetings with a gap ≤ 1 min — "busy until" spans both |

Notes:

- The prompt only starts when a tablet asks for the room's status (a row
  appears in `check_ins`); rooms without a tablet are never released. Once
  started and left unanswered past `checkInMinutes`, the meeting is released
  (shortened to now) on the next status read, or by the cron job if the tablet
  went offline.
- To see the prompt again for the same meeting, delete its `check_ins` row and
  move `startsAt` back to just before now.

### Behaviour settings

Edit on **Admin → Security**, or directly in the single-row `app_settings` table:

```sql
UPDATE app_settings SET "checkInEnabled" = false;   -- no presence prompt at all
UPDATE app_settings SET "checkInMinutes" = 1;       -- prompt expires after 1 min
UPDATE app_settings SET "maxBookingMinutes" = 30;   -- cap walk-in bookings
```

### Seasonal themes with the real backend

`?theme=<season>` forces a seasonal look on real data until that season's end
(`?theme=none` turns themes off, `?theme=auto` goes back to the calendar). The
parameter is removed from the address after it's read, and the choice is kept
for the tab. Seasons are listed in `frontend/src/lib/season.ts`.
