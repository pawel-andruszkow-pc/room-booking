import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Copy, Download, Plus, RefreshCw } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import type { CalendarSummary } from '@/types';

/** Google connection status + one-tap import of Workspace room resources. */
export const CalendarTab = observer(function CalendarTab() {
  const { admin, toast } = useStores();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newCalendarId, setNewCalendarId] = useState('');
  const [adding, setAdding] = useState(false);
  const provider = admin.provider;

  const load = async () => {
    setLoading(true);
    try {
      await admin.loadCalendars();
      setLoaded(true);
    } catch (err) {
      toast.error('Could not list calendars', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  /** Google never lists a calendar merely shared with a service account; subscribing by id fixes that. */
  const addById = async () => {
    const id = newCalendarId.trim();
    if (!id) return;
    setAdding(true);
    try {
      const cal = await admin.addCalendar(id);
      setNewCalendarId('');
      setLoaded(true);
      toast.success(`Calendar "${cal.summary}" is now visible`);
    } catch (err) {
      toast.error('Could not add calendar', (err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const importCalendar = async (cal: CalendarSummary) => {
    try {
      await admin.createRoom({
        name: cleanRoomName(cal.summary),
        calendarId: cal.id,
        location: cal.location,
        capacity: cal.capacity,
        isActive: true,
      });
      toast.success(`Room "${cleanRoomName(cal.summary)}" added`);
    } catch (err) {
      toast.error('Could not add room', (err as Error).message);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.info('Copied');
    } catch {
      toast.error('Clipboard not available');
    }
  };

  const usedIds = new Set(admin.rooms.map((r) => r.calendarId));
  const roomNameFor = (calendarId: string) =>
    admin.rooms.find((r) => r.calendarId === calendarId)?.name ?? calendarId;

  return (
    <div className="space-y-8">
      <Card>
        <div className="flex items-start justify-between gap-6">
          <div>
            <CardTitle>
              Calendar provider{' '}
              <Badge variant={provider?.provider === 'google' ? 'success' : 'warning'} className="ml-2 align-middle">
                {provider?.provider ?? '…'}
              </Badge>
            </CardTitle>
            <CardDescription>
              {provider?.provider === 'google'
                ? 'Events are read from and written to Google Calendar.'
                : 'Events live in the local database — no Google account is used. Set CALENDAR_PROVIDER=google on the backend to connect Google Calendar.'}
            </CardDescription>
          </div>
        </div>

        {provider?.provider === 'google' && (
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white/5 p-6">
              <div className="text-sm font-bold uppercase tracking-wider text-white/50">Service account</div>
              <div className="mt-2 flex items-center gap-3">
                <span className="truncate font-mono text-lg">{provider.serviceAccountEmail ?? '—'}</span>
                {provider.serviceAccountEmail && (
                  <Button variant="ghost" size="sm" onClick={() => copy(provider.serviceAccountEmail!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-3 text-sm text-white/45">
                Share each room calendar with this address (“Make changes to events”).
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-6">
              <div className="text-sm font-bold uppercase tracking-wider text-white/50">Impersonated user</div>
              <div className="mt-2 font-mono text-lg">{provider.impersonatedUser ?? 'not set'}</div>
              <p className="mt-3 text-sm text-white/45">Optional, needs domain-wide delegation.</p>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <div className="text-sm font-bold uppercase tracking-wider text-white/50">Push notifications</div>
                <Badge variant={provider.push.enabled ? 'success' : 'warning'}>
                  {provider.push.enabled ? `on · ${provider.push.channels.length} channel(s)` : 'off'}
                </Badge>
              </div>
              {provider.push.enabled ? (
                <>
                  <div className="mt-2 truncate font-mono text-sm text-white/70">{provider.push.address}</div>
                  <p className="mt-3 text-sm text-white/45">
                    Google reports calendar changes instantly. Rooms not listed below are polled.
                  </p>
                  {provider.push.channels.length > 0 && (
                    <ul className="mt-4 space-y-1 font-mono text-sm text-white/60">
                      {provider.push.channels.map((c) => (
                        <li key={c.calendarId} className="flex justify-between gap-4">
                          <span className="truncate">{roomNameFor(c.calendarId)}</span>
                          <span className="shrink-0">renews {new Date(c.expiresAt).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-white/45">
                  {provider.push.disabledReason ?? 'Disabled'}. Rooms are polled instead.
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Available calendars</CardTitle>
            <CardDescription>
              Add each shared room calendar as a room.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-5 w-5" /> : admin.calendars.length ? <RefreshCw className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            {admin.calendars.length ? 'Refresh' : 'Load calendars'}
          </Button>
        </div>

        {provider?.provider === 'google' && (
          <div className="mt-6 rounded-2xl bg-white/5 p-6">
            <Label htmlFor="new-calendar-id">Add a calendar by id</Label>
            <p className="mt-1 text-sm text-white/45">
              Shared calendars appear here only after they are added once by id (the room's resource e-mail).
            </p>
            <div className="mt-4 flex gap-3">
              <Input
                id="new-calendar-id"
                value={newCalendarId}
                onChange={(e) => setNewCalendarId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addById()}
                placeholder="c_1234…@resource.calendar.google.com"
                className="font-mono"
                disabled={adding}
              />
              <Button variant="accent" onClick={addById} disabled={adding || !newCalendarId.trim()}>
                {adding ? <Spinner className="h-5 w-5" /> : <Plus className="h-5 w-5" />} Add
              </Button>
            </div>
          </div>
        )}

        {loaded && admin.calendars.length === 0 && (
          <p className="mt-6 text-sm text-white/45">No calendars yet. Add one by id above.</p>
        )}

        {admin.calendars.length > 0 && (
          <ul className="mt-6 divide-y divide-white/10">
            {admin.calendars.map((cal) => {
              const used = usedIds.has(cal.id);
              return (
                <li key={cal.id} className="flex items-center gap-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-xl font-semibold">{cal.summary}</span>
                      {cal.capacity && <Badge>{cal.capacity} seats</Badge>}
                      {!cal.canWrite && <Badge variant="warning">read-only</Badge>}
                    </div>
                    <div className="truncate font-mono text-sm text-white/50">{cal.id}</div>
                  </div>
                  {used ? (
                    <Badge variant="success">added</Badge>
                  ) : (
                    <Button variant="accent" size="sm" onClick={() => importCalendar(cal)}>
                      <Plus className="h-4 w-4" /> Add as room
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {provider?.provider === 'local' && <LocalEventForm />}
    </div>
  );
});

/** Strips the Workspace prefix ("ROOMS-6th floor-Yellow (4)" → "Yellow"). */
function cleanRoomName(summary: string): string {
  const withoutCapacity = summary.replace(/\s*\(\d+\)\s*$/, '');
  const parts = withoutCapacity.split('-').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || summary;
}

/** Local provider only: create a demo meeting to see the busy / check-in flows. */
const LocalEventForm = observer(function LocalEventForm() {
  const { admin, toast } = useStores();
  const [calendarId, setCalendarId] = useState(admin.rooms[0]?.calendarId ?? '');
  const [title, setTitle] = useState('Demo meeting');
  const [startsIn, setStartsIn] = useState('0');
  const [duration, setDuration] = useState('30');
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!calendarId) return;
    setBusy(true);
    try {
      // An all-day event spans this browser's calendar day; close enough for a demo.
      const start = allDay
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : new Date(Date.now() + Number(startsIn) * 60000);
      const end = allDay
        ? new Date(start.getTime() + 24 * 60 * 60000)
        : new Date(start.getTime() + Number(duration) * 60000);
      await admin.createLocalEvent({
        calendarId,
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: allDay,
      });
      toast.success('Demo meeting created');
    } catch (err) {
      toast.error('Could not create event', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>Create a demo meeting</CardTitle>
      <CardDescription>Only available with the local provider. Handy for testing the tablet flow.</CardDescription>
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="col-span-2">
          <Label>Room</Label>
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger>
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent>
              {admin.rooms.map((r) => (
                <SelectItem key={r.id} value={r.calendarId}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label htmlFor="ev-title">Title</Label>
          <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ev-start">Starts in (min)</Label>
          <Input id="ev-start" type="number" inputMode="numeric" value={startsIn} disabled={allDay} onChange={(e) => setStartsIn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ev-duration">Duration (min)</Label>
          <Input id="ev-duration" type="number" inputMode="numeric" min={5} value={duration} disabled={allDay} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="flex items-end gap-3 pb-2">
          <Switch id="ev-all-day" checked={allDay} onCheckedChange={setAllDay} />
          <Label htmlFor="ev-all-day">All day</Label>
        </div>
        <div className="flex items-end">
          <Button variant="accent" className="w-full" disabled={busy || !calendarId} onClick={create}>
            {busy ? <Spinner className="h-5 w-5" /> : <Plus className="h-5 w-5" />} Create
          </Button>
        </div>
      </div>
    </Card>
  );
});
