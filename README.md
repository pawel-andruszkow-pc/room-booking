# Room Booking 🚪

Meeting-room display and booking app for 10" wall tablets (1920×1200, landscape),
backed by Google Calendar. Each tablet shows one room: **Free** (green) or
**Busy** (orange), the current time, what's next, and lets people book the room
on the spot, end a meeting early, or confirm they actually showed up.

- **Frontend:** React 19 + TypeScript + Vite, MobX, Radix UI primitives, Tailwind 4, Motion (port **3021**)
- **Backend:** NestJS 11 + TypeORM + PostgreSQL, REST API (port **3020**)
- **Calendar:** Google Calendar via a service account, or a built-in local provider for development
- **Hosting:** Railway (two services + Postgres plugin) — see [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Features

| Screen | What it does |
| --- | --- |
| **Room** | Green “Free” with next meeting (or “No more meetings today”), orange with event title + time slot when busy. Clock always visible. |
| **Today** | Ghost button in the corner opens a whole-day view: a vertical time scale (full hours as the main unit, half hours secondary) with each meeting drawn as a rectangle the length of its slot, past ones dimmed and a “now” marker across the current one. |
| **Book** | Two sections side by side: **Book this room now** (15 min – 2 h presets plus a slider, only durations that fit before the next meeting) and **Reserve for later today** (pick the hour, the quarter past it and a length; slots that clash with an existing meeting are disabled). A reservation is *not* checked in on booking, so the presence prompt still releases it if nobody turns up. |
| **End meeting** | Two-step inline confirmation; shortens the calendar event to *now*. |
| **Presence check** | When a meeting starts the tablet asks “Is this meeting taking place?”. If nobody taps **Yes** within 15 min (configurable) the room is released — on the tablet, and by a server cron job as a safety net. |
| **Settings** (PIN) | Assign this device to a room, name it, switch on **kiosk mode** (fullscreen, wake lock, no cursor). Tap the clock 5× to reach it from kiosk mode. |
| **Admin** (PIN) | Rooms CRUD with calendar-connection test, one-tap import of Google Workspace room resources, device overview, PIN & behaviour settings. |
| **Login** | HTTP Basic credentials, entered once per device and stored locally; every API call carries them. |

### Google Workspace rooms

The app is built for the standard Workspace setup where rooms are **resource
calendars** (e.g. `ROOMS-6th floor-Yellow (4)`) that people add to an event.
The backend reads the resource calendar directly. To end or release a meeting
someone else organised it shortens the room's copy of the event; if Google
refuses (no delegation), it makes the room **decline** the event instead — the
same mechanism Google uses for no-shows — so the room frees up either way.

## Quick start (local, no Google account needed)

Requirements: Node ≥ 24 (see `.nvmrc`), pnpm 11, Docker.

### 1. Database

```bash
cp backend/.env.example backend/.env   # defaults work out of the box
docker compose up -d                   # PostgreSQL on localhost:5434
```

### 2. Backend

```bash
cd backend
pnpm install
pnpm migration:run     # create the schema
pnpm seed              # 3 rooms + demo meetings around "now"
pnpm start:dev         # http://localhost:3020/api
```

The seed creates rooms **Yellow** (busy now), **Violet** (free, meeting in 45 min)
and **Palmiarnia** (meeting just started → presence prompt). Re-run `pnpm seed`
any time to reset the demo meetings around the current time; `pnpm seed -- --reset`
also wipes rooms and devices.

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL empty → uses the /api dev proxy
pnpm install
pnpm dev               # http://localhost:3021
```

### 4. First run

1. Open http://localhost:3021 and sign in with `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`
   from `backend/.env` (defaults `admin` / `change-me`).
2. You land on “This device isn't assigned to a room” → **Open settings** → PIN `1234`.
3. Pick a room, optionally enable **kiosk mode**, **Save**.
4. Admin page: from settings → **Open admin page** → PIN `0000`.

On a tablet, open the same URL in Chrome (or a kiosk browser such as Fully Kiosk),
sign in, assign the room and enable kiosk mode. Chrome's *Add to Home screen*
gives a standalone fullscreen app.

## Connecting Google Calendar

1. In Google Cloud create a project, enable the **Google Calendar API**, create a
   **service account** and download a JSON key.
2. Give it access to the room calendars — one of:
   - **Share each room calendar** with the service-account e-mail and grant
     *Make changes to events* (Workspace admin console → Buildings and resources →
     Resources → open the room → *Share*), or
   - Enable **domain-wide delegation** for the service account with scope
     `https://www.googleapis.com/auth/calendar` and set `GOOGLE_IMPERSONATE_USER`
     to a Workspace user who manages the rooms. This is the most capable option:
     the backend can then modify meetings organised by anyone.
3. In `backend/.env`:
   ```
   CALENDAR_PROVIDER=google
   GOOGLE_SERVICE_ACCOUNT_EMAIL=room-display@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   GOOGLE_IMPERSONATE_USER=office-admin@yourcompany.com   # optional
   ```
4. Restart the backend, open **Admin → Calendar → Load calendars** and press
   **Add as room** next to each room resource. Names like
   `ROOMS-6th floor-Yellow (4)` become room *Yellow* with capacity 4.
   Alternatively put the ids in `SEED_ROOMS` and run `pnpm seed`.
5. **Test** on each room card verifies the backend can read that calendar.

Calendar ids for resources look like `c_188…@resource.calendar.google.com`;
you can copy them from the calendar's *Settings → Integrate calendar*.

## Configuration

All backend settings live in `backend/.env` (see `.env.example` for descriptions):

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | `local` (default) or `production`; only production registers Google push channels |
| `DATABASE_URL` | Postgres connection string (Railway: `${{Postgres.DATABASE_URL}}`) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Credentials for the page and the API |
| `SETTINGS_PIN` / `ADMIN_PIN` | Initial PINs (editable later on the admin page) |
| `CALENDAR_PROVIDER` | `local` or `google` |
| `GOOGLE_*` | Service-account credentials |
| `PUBLIC_URL` | Public `https://` origin of the API; enables Google push notifications (derived from `RAILWAY_PUBLIC_DOMAIN` on Railway) |
| `WATCH_INTERVAL_SECONDS` / `WATCH_PUSH_FALLBACK_SECONDS` | How often the backend re-reads a watched room's calendar, without / with Google push |
| `SEED_ROOMS` | `Name=calendarId,…` used by `pnpm seed` |
| `TIMEZONE` | IANA zone for “today” and displayed times |
| `CORS_ORIGIN` | Allowed frontend origin(s) |

Behavioural settings (presence window, refresh interval, max walk-in booking,
timezone) are stored in the database and edited on **Admin → Security**.

## Architecture

```
frontend/  React SPA
  src/stores/      MobX stores: Clock (1 s tick), Auth, Device, Room (polling + actions), Admin, Toast
  src/pages/       Room, Book, Today, Settings, Admin (Rooms/Devices/Calendar/Security), Login
  src/components/  ui/ (Radix-based primitives), Clock, PinPad, PageShell, PinGate
backend/   NestJS API (prefix /api)
  auth/       GET /auth/me (verify Basic creds), POST /auth/pin
  rooms/      CRUD + GET /rooms/:id/status | today, POST …/book | end | check-in | release
  devices/    register/assign tablets
  calendar/   provider abstraction: GoogleCalendarProvider | LocalCalendarProvider
  bookings/   status computation, presence check-ins, auto-release cron
  settings/   single-row app settings (PINs, check-in window, …)
  database/   TypeORM config, CLI data source and migrations/
  seed/       `pnpm seed` CLI
```

**Why MobX instead of React context?** The room screen has a clock ticking
every second, a polling loop and countdowns. With MobX each `observer`
component re-renders only when the exact values it read change (the clock
digits, not the whole page), which keeps the tablet UI smooth without manual
memoisation. Context would push every tick through the tree.

**Optimistic updates.** Every tap (book, end, confirm, release, device and
admin edits) updates the screen immediately with the predicted result; the
server response then replaces the prediction and a failure rolls back with a
toast. `RoomStore` bumps a version on each action so a status poll that was
already in flight cannot overwrite the newer state.

**Self-updating kiosks.** Tablets run fullscreen with nobody to press reload,
so every build writes its identity to `/version.json` (`vite.config.ts`) and
inlines the same id in the bundle. `UpdateStore` polls that file once a minute
and reloads the page when the two differ — but only while the screen is idle
(20 s untouched), online, and showing the room or day view, so a reload never
interrupts someone mid-booking. A deploy therefore reaches every tablet within
about a minute without touching them.

**Auth model.** All tablets share one HTTP Basic credential (page + API). Two
PINs separate roles on a shared screen: the *settings PIN* lets someone assign
a tablet to a room; the *admin PIN* protects rooms, calendar and PIN changes.
PIN-protected routes require `X-Settings-Pin` / `X-Admin-Pin` headers on the
API as well, so the UI gate is not the only line of defence.

**Presence logic.** `GET /rooms/:id/status` computes `free | busy | awaiting-check-in`
from today's events and the `check_ins` table. A prompt is only started when a
tablet asks (rooms without a tablet are never auto-released). A cron job
releases expired prompts even if the tablet went offline.

## Database migrations

The schema is managed with TypeORM migrations — `synchronize` is always off.

```bash
pnpm migration:run                                   # apply pending
pnpm migration:generate -- src/database/migrations/AddThing   # diff entities vs. DB
pnpm migration:revert
```

In deployed environments migrations run automatically on every boot
(`pnpm run migration:run:prod && node dist/main.js` in `backend/Dockerfile`).

## Scripts

Root `package.json` has convenience scripts: `pnpm install:all`, `pnpm dev:backend`,
`pnpm dev:frontend`, `pnpm build`, `pnpm lint`, `pnpm db:up`, `pnpm seed`.

Each app also has `pnpm lint`, `pnpm typecheck` and `pnpm format`.

## Claude Code skills

`.claude/skills/` contains review skills for Claude Code:

- `/code-review` — full-stack review checklist for this repo (correctness, kiosk UX, calendar edge cases)
- `/backend-review` — NestJS/TypeORM/Google Calendar specifics
- `/frontend-review` — MobX, Radix, performance on the tablet

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the Railway setup (Postgres plugin,
backend service from `backend/Dockerfile`, frontend service from
`frontend/Dockerfile` with `VITE_API_URL` build arg).
