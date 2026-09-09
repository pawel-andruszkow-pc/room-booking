---
name: frontend-review
description: Deep review of frontend/ changes (React 19, MobX stores, Radix-based UI, Tailwind 4, Motion) with focus on tablet/kiosk performance and UX. Use when a change touches frontend/src.
---

# Frontend review (React + MobX kiosk UI)

Scope: `frontend/`. Target device: 10" tablet, 1920×1200 landscape, touch
only, runs 24/7 in a browser. Performance and reliability beat visual flourish.

## Verify first

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm build
```

Watch the bundle size in the build output; a jump > 100 kB gzip needs a reason.

## Checklist

### State (MobX)
- Components that read observables are wrapped in `observer`.
- Mutations only inside actions (`makeAutoObservable` + `runInAction` after
  `await`); `enforceActions: 'observed'` will warn otherwise.
- `RoomStore` remains the only poller; `start(roomId)` is idempotent and
  `stop()` clears timers, abort controllers and reactions.
- Derived values that change every second are isolated (`Clock`,
  `CountdownLabel`); everything else reads `clock.minute` at most.
- Server clock offset is synced from `status.now` (`clock.syncWith`).
- Mutations are optimistic: `RoomStore.mutate` applies a prediction, bumps
  `version` so in-flight polls are discarded, and rolls back on error;
  `AdminStore` / `DeviceStore` edits snapshot-then-restore the same way. New
  actions must follow this pattern (predict → send → reconcile → rollback) and
  callers must not `await` before navigating or showing success feedback.

### Rendering performance
- No per-second re-render of the whole room screen (check React DevTools or
  reason about which observables each component touches).
- Animations: `motion` on opacity/transform only; `AnimatePresence mode="wait"`
  keyed by state + event id; no `layout` animations on large text.
- Background colour transitions via CSS classes (`transition-colors`).
- The room screen shows only room name, clock, state headline, one context line and the buttons — resist adding more.
- No blocking work in render; fonts loaded with `display=swap`.

### UX rules for the kiosk
- Prefer dedicated pages over modals; inline two-step confirmation for
  destructive actions (end meeting, delete).
- Primary action ≥ 96 px tall on the room screen; secondary ≥ 56 px.
- Every failure shows a toast; the room screen keeps the last known status and
  shows “Reconnecting…” instead of blanking.
- Kiosk mode (`useKiosk`): cursor hidden, context menu blocked, wake lock
  re-acquired on visibility change, fullscreen requested only from a gesture;
  all listeners removed on cleanup.
- Secret access (5 taps on the clock) keeps working; PIN gates use
  `auth.hasPin(scope)` and PINs live in `sessionStorage` only.

### API & types
- `frontend/src/types.ts` mirrors backend DTOs; `lib/api.ts` has one function
  per route and no inline `fetch`.
- `ApiError` messages are shown to users; 401 triggers `auth.handleUnauthorized`.
- Headers: `X-Settings-Pin`, `X-Admin-Pin`, `X-Device-Id` come from
  `configureHttp`, never hard-coded in components.

### Components
- New primitives live in `components/ui/` and wrap Radix where a primitive
  exists (Select, Switch, Tabs, Toast, Slider, Label, Separator, Slot).
- `cn()` for class merging; `cva` for variants.
- Accessible names on icon-only buttons (`aria-label`).
- Times formatted with `lib/time.ts` in the room timezone; no `toLocaleTimeString`.

### Build & deploy
- `VITE_API_URL` is the only build-time env; relative `/api` remains the default.
- `index.html` viewport meta unchanged (no zoom on tablets).
- Dockerfile/nginx template untouched unless the change needs it.
