---
name: code-review
description: Review changes in the room-booking repo (NestJS backend + React kiosk frontend) for correctness, calendar edge cases, kiosk UX and consistency with project conventions. Use for "review my changes", "review this PR", or before committing.
---

# Room-booking code review

Review the current diff (`git diff`, or the branch/PR the user names). Report
findings ordered by severity; for each give file:line, what breaks, and a
concrete fix. Skip style nits the linters already enforce (`pnpm lint` in both
apps). Finish with a short verdict: ship / fix first.

## 1. Gather context

1. `git status` and `git diff` (or `git diff main...HEAD`). List touched areas:
   backend modules, frontend stores/pages, migrations, env files, docs.
2. If backend entities changed, check a migration was added under
   `backend/src/database/migrations/` and that `typeorm.config.ts` lists the entity.
3. If DTOs or the `RoomStatus` shape changed, confirm `frontend/src/types.ts`
   was updated to match (types are mirrored by hand).
4. If env variables were added: `.env.example`, `env.validation.ts`,
   `README.md` and `docs/DEPLOY.md` must all mention them.

## 2. Domain rules that must hold

- **Status computation** (`bookings.service.ts#getStatus`): `current` is the
  event with `start <= now < end`; all-day events never block a room;
  `availableMinutes` is capped by `maxBookingMinutes` and by the next event.
- **Presence check**: a prompt may only start when `fromDevice` is true;
  rooms without a tablet must never be auto-released. Past-deadline events
  with no record are auto-confirmed, not released. The cron only releases
  records that are pending and past their deadline.
- **Booking**: rejected with 409 when the room is busy or the duration exceeds
  `availableMinutes`; bookings from the tablet create a *confirmed* check-in.
- **Ending / releasing** shortens the event to *now*, or deletes it if it
  started < 1 min ago. For Google, a 403 falls back to declining as the room.
- **Timezone**: day boundaries use `settings.timezone` via date-fns-tz; never
  the server's local zone.
- **Auth**: every route is behind `BasicAuthGuard` unless `@Public()`;
  mutations on rooms/settings/calendar need `@RequirePin('admin')`, device
  assignment needs `@RequirePin('settings')`. The 401 must not carry
  `WWW-Authenticate` (it would trigger the browser dialog on the kiosk).

## 3. Frontend checks

- Observers: any component reading store state is wrapped in `observer`; state
  mutations happen in store actions (`enforceActions: 'observed'`).
- Per-second updates only in components that need them (`Clock`,
  `CountdownLabel`); minute-level labels depend on `clock.minute`.
- Animations use transform/opacity only; no layout-thrashing animations on the
  room screen. Colour changes via CSS `transition-colors`.
- New flows use pages, not modals; confirmations are inline two-step buttons.
- Touch targets ≥ 56 px on the room screen; text remains legible at 1920×1200.
- Kiosk mode side effects (`useKiosk`) are cleaned up on unmount.
- Errors surface via `toast.error`, never `alert()` / `confirm()`.

## 4. Backend checks

- DTOs validate every field (`class-validator`), `whitelist` is on so extra
  fields are rejected — new fields must be declared.
- No N+1 calendar calls: one `listEvents` per status request.
- Google provider: handles `cancelled`, declined-by-room, all-day, recurring
  instances (`singleEvents: true`); never logs the private key.
- Migrations are reversible and match the entity definitions exactly
  (column types, nullability, defaults, constraints).
- Logs use Nest `Logger`, not `console.log`.

## 5. Output format

```
### Findings
1. [severity] file:line — problem → fix
...
### Verdict
```
