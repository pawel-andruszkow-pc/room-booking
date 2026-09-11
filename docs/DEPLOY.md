# Deploying to Railway

The app has two deployable services (backend API, frontend static site) plus a
PostgreSQL database — the same layout as the *spiewnik* project.

## 1. Database

In your Railway project add the **PostgreSQL** plugin. Railway exposes a
`DATABASE_URL` variable on the project — the backend reads it automatically (see
`backend/src/database/typeorm.config.ts`).

The schema is created and updated via **TypeORM migrations**. The backend
container runs pending migrations automatically on every deploy/boot: its start
command is `pnpm run migration:run:prod && node dist/main.js` (see
`backend/Dockerfile`). If a migration fails the container exits, so a broken
schema never serves traffic.

> For local development the database runs via `docker-compose.yml` in the repo
> root instead, and you run `pnpm migration:run` yourself.

## 2. Backend service

- **Root directory:** `backend`
- Railway auto-detects `backend/Dockerfile`.
- **Environment variables** (Settings → Variables):

  | Variable | Value |
  | --- | --- |
  | `ENVIRONMENT` | `production` — required for Google push notifications (defaults to `local`, which only polls) |
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (append `?sslmode=require` if needed) |
  | `CORS_ORIGIN` | public URL of the frontend service, e.g. `https://room-booking.up.railway.app` |
  | `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | credentials tablets sign in with — use a long random password |
  | `SETTINGS_PIN` / `ADMIN_PIN` | initial PINs (only used on first boot; change them on the admin page) |
  | `TIMEZONE` | e.g. `Europe/Warsaw` |
  | `CALENDAR_PROVIDER` | `google` |
  | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from the service-account JSON key (`client_email`) |
  | `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key. Paste it with the literal `\n` sequences (as it appears in the JSON file) — the app converts them to newlines |
  | `GOOGLE_IMPERSONATE_USER` | optional Workspace user for domain-wide delegation |
  | `SEED_ROOMS` | optional, only if you plan to run the seed |
  | `PUBLIC_URL` | optional — Railway sets `RAILWAY_PUBLIC_DOMAIN`, which the backend uses automatically. Set this only behind a custom domain or a proxy, as the `https://` origin Google can reach |

  `PORT` is provided by Railway automatically; `main.ts` honours it.

- **Health check:** `/api/health` (unauthenticated).

- **Seeding rooms in production (optional):** open a shell on the backend
  service (Railway → service → *Shell*) and run `node dist/seed/seed.js`.
  With `CALENDAR_PROVIDER=google` the seed only creates the rooms from
  `SEED_ROOMS`; events come from Google. You can also add rooms from the admin
  page instead (Calendar tab → *Load calendars* → *Add as room*).

## 3. Frontend service

- **Root directory:** `frontend`
- Railway auto-detects `frontend/Dockerfile` (nginx serving the Vite build).
- **Build argument:**
  - `VITE_API_URL` → the public backend URL **including** `/api`,
    e.g. `https://room-booking-api.up.railway.app/api`.
    Set it as a service variable; Railway passes service variables as build
    args and Vite inlines it during `pnpm run build`. Changing it requires a
    redeploy.
- The container listens on the Railway-assigned `PORT` (default 8080).

### Tablets update themselves

The build writes `dist/version.json` with a build id (Railway's
`RAILWAY_GIT_COMMIT_SHA` when it is passed as a build arg, otherwise the build
timestamp) and nginx serves it uncached. Every tablet polls it once a minute
and reloads itself into the new build while the screen is idle, so a deploy
does not need anyone to walk up to the kiosks. Nothing to configure — just make
sure `BUILD_ID` is *not* pinned to a constant value.

## 4. After deploy

1. Open the frontend URL on the tablet, sign in with the Basic credentials.
2. Open **Settings** (PIN), assign the room, enable **kiosk mode**, save.
3. In Chrome on Android use *Add to Home screen* and launch from there for a
   fullscreen standalone window, or use a kiosk browser (Fully Kiosk Browser,
   Kiosk Browser Lockdown) pointed at the URL. Both keep the app running after
   reboots; the credentials and room assignment are stored on the device.
4. Admin page: Settings → *Open admin page* (admin PIN) → **Calendar** tab →
   *Load calendars* → *Add as room* for every room resource, then **Test**.

## Notes

- Two Railway services is the recommended setup. If you prefer a single
  origin, put a reverse proxy in front that forwards `/api` to the backend and
  everything else to the frontend, and leave `VITE_API_URL` empty.
- The backend logs every booking, end and release with the room name, which is
  handy in Railway's log view when debugging calendar permissions.
- Google push notifications: with `ENVIRONMENT=production`,
  `CALENDAR_PROVIDER=google` and a public https origin the backend registers a Calendar *watch channel* per room and
  Google POSTs to `/api/calendar/webhooks/google` on every change, so tablets
  update within a second. Channels are renewed automatically (every 10 minutes
  the backend reconciles them with the rooms table) and the rooms are still
  polled every `WATCH_PUSH_FALLBACK_SECONDS` as a safety net. The admin
  Calendar tab shows whether push is active and which calendars have a channel.
  With `ENVIRONMENT=local` (the default) push is never registered, so a
  developer's backend cannot take over the production calendars' channels.
- Google eventual consistency: after shortening an event the calendar API may
  still return the old end for a second or two; the app tolerates this by
  treating released events as free based on its own `check_ins` records.
- Schema changes: edit an entity locally, run
  `pnpm migration:generate -- src/database/migrations/Name`, review the SQL, commit, and
  deploy — the container's start command applies it on the next boot.
