---
name: backend-review
description: Deep review of backend/ changes (NestJS, TypeORM, Google Calendar integration, migrations, env). Use when a change touches backend/src, migrations or backend env files.
---

# Backend review (NestJS + TypeORM + Google Calendar)

Run from the repo root. Scope: `backend/`. Complements `/code-review` with
backend-specific depth. Report file:line, impact, fix. Run the checks below
before writing conclusions.

## Verify first

```bash
cd backend && pnpm typecheck && pnpm lint && pnpm build
```

If a database is available (`docker compose up -d`), also run
`pnpm migration:run` and `pnpm seed`, then hit `GET /api/health` and
`GET /api/rooms/:id/status` with Basic credentials.

## Checklist

### Modules & DI
- New providers are registered in a module and exported when other modules
  need them. `SettingsModule` is global; nothing else should be.
- Guards stay in registration order in `app.module.ts`: Basic auth, then PIN.
- Controllers stay thin; logic lives in services.

### Entities & migrations
- Every entity change ships with a hand-written or generated migration in
  `src/database/migrations/` whose SQL matches the decorators (types, `timestamptz`,
  nullability, defaults, unique constraints, FK `ON DELETE`).
- `down()` fully reverses `up()`.
- `typeorm.config.ts` `entities` array includes any new entity; the seed module
  imports it too if the seed touches it.

### Calendar providers
- Both `GoogleCalendarProvider` and `LocalCalendarProvider` implement every
  method of `CalendarProvider`; behaviour differences are documented.
- Google: `singleEvents: true` + `orderBy: 'startTime'`; skip `cancelled` and
  events the room declined; 403 on patch/delete falls back to
  `declineAsRoom`; private key handling (`\n` unescape) unchanged; client
  built lazily so local mode never needs credentials.
- Time is always ISO UTC across the API boundary; formatting happens in the
  frontend in the configured timezone.

### Bookings & presence
- `getStatus` remains the single source of truth; every mutation returns a
  fresh status.
- `fromDevice` semantics preserved (cron uses `false`).
- `releaseExpired` swallows per-room errors so one broken calendar cannot stop
  the loop; `AutoReleaseService` guards against overlapping ticks.
- Conflicts are `ConflictException` (409), not 400.

### Security
- `safeEqual` for every secret comparison.
- 401 responses omit `WWW-Authenticate`.
- Admin-only data (PINs) never leaves `SettingsService.getPublic()`.
- CORS `allowedHeaders` lists any new custom header.

### Config & docs
- New env var → `.env.example` (with comment), `env.validation.ts` if
  required, `README.md` table, `docs/DEPLOY.md` Railway table.
- Dockerfile still builds: dependencies used at runtime are in
  `dependencies`, not `devDependencies` (production stage installs with `--prod`).
