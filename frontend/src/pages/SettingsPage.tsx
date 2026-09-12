import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, Lock, Save, Trash2, X } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { PageShell } from '@/components/PageShell';
import { PinGate } from '@/components/PinGate';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { formatRange } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types';

const NONE = '__none__';

export function SettingsPage() {
  return (
    <PinGate
      scope="settings"
      title="Device settings"
      description="Enter the settings PIN, or the admin PIN to open administration"
    >
      <SettingsForm />
    </PinGate>
  );
}

/** Assign this tablet to a room and switch kiosk mode on. */
const SettingsForm = observer(function SettingsForm() {
  const { device, admin, auth, room, toast, update } = useStores();
  const navigate = useNavigate();

  const [name, setName] = useState(device.device?.name ?? '');
  const [roomId, setRoomId] = useState<string>(device.roomId ?? NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    admin.loadRooms().catch((err) => toast.error('Could not load rooms', (err as Error).message));
  }, [admin, toast]);

  const dirty =
    name !== (device.device?.name ?? '') || (roomId === NONE ? null : roomId) !== device.roomId;

  // Optimistic: DeviceStore applies the assignment locally first, so the room
  // screen can open immediately; a failure restores the previous assignment.
  const save = () => {
    setSaving(true);
    device
      .update(
        {
          name: name.trim() || undefined,
          roomId: roomId === NONE ? null : roomId,
        },
        admin.rooms,
      )
      .then(() => toast.success('Device settings saved'))
      .catch((err: Error) => toast.error('Could not save, reverted', err.message))
      .finally(() => setSaving(false));
    if (roomId !== NONE) navigate('/');
  };

  return (
    <PageShell
      title="Device settings"
      subtitle="Which room does this tablet show?"
      timezone={room.timezone}
      actions={
        <Button variant="ghost" size="md" onClick={() => auth.lock()}>
          <Lock className="h-5 w-5" /> Lock
        </Button>
      }
    >
      <div className="grid grid-cols-[1.4fr_1fr] gap-10">
        <Card>
          <CardTitle>This device</CardTitle>
          <CardDescription>Assign the room this tablet is mounted next to.</CardDescription>

          <div className="mt-8 space-y-8">
            <div>
              <Label htmlFor="device-name">Device name (optional)</Label>
              <Input
                id="device-name"
                value={name}
                placeholder="Shown on the admin devices list"
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <Label>Room</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Not assigned —</SelectItem>
                  {admin.activeRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.location ? ` · ${r.location}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {admin.rooms.length === 0 && (
                <p className="mt-2 text-white/50">No rooms yet — create them on the admin page.</p>
              )}
            </div>
          </div>

          <div className="mt-10">
            <Button size="lg" variant="accent" disabled={!dirty || saving} onClick={save}>
              {saving ? <Spinner /> : <Save className="h-6 w-6" />} Save
            </Button>
          </div>
        </Card>

        <div className="space-y-10">
          <Card>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as {auth.user ?? '…'}</CardDescription>
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => {
                auth.lock();
                auth.logout();
                navigate('/login');
              }}
            >
              <LogOut className="h-6 w-6" /> Sign out on this device
            </Button>
          </Card>

          <Card>
            <CardTitle>This build</CardTitle>
            <CardDescription>
              Tablets reload themselves within a minute of a deploy, so this is how to tell whether
              one has picked it up.
            </CardDescription>
            <dl className="mt-6 space-y-4 text-lg">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-white/60">Version</dt>
                <dd className="tabular font-semibold">{update.buildId}</dd>
              </div>
              {update.available && update.serverBuildId && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-white/60">Update waiting</dt>
                  <dd className="tabular font-semibold text-attention">{update.serverBuildId}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-white/60">Device id</dt>
                <dd className="tabular truncate text-white/60">{device.deviceId}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {device.roomId && <MeetingsCard />}
    </PageShell>
  );
});

/**
 * Today's meetings in the assigned room, each with a way to delete it from the
 * calendar. The room screen only ever frees the meeting in progress; this is
 * for a stray reservation or a test meeting that has to go.
 */
const MeetingsCard = observer(function MeetingsCard() {
  const { day: store, clock, room, toast } = useStores();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // The cached day opens at once; the fetch behind it brings any change since.
  useEffect(() => {
    void store.refresh();
  }, [store]);

  const day = store.day;
  const tz = day?.timezone ?? room.timezone;
  const events = day ? [...day.allDay, ...day.events] : [];

  const remove = async (event: CalendarEvent) => {
    setConfirmId(null);
    setRemovingId(event.id);
    try {
      await store.removeEvent(event.id);
      toast.success(`Removed "${event.title}"`);
    } catch (err) {
      toast.error('Could not remove the meeting', (err as Error).message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="mt-10">
      <CardTitle>Today's meetings</CardTitle>
      <CardDescription>
        Remove a meeting from the room's calendar. A meeting owned by someone else is declined on
        the room's behalf, which frees the room just the same.
      </CardDescription>

      {!day ? (
        store.error ? (
          <p className="mt-6 text-white/60">Could not load today: {store.error}</p>
        ) : (
          <div className="flex justify-center py-10">
            <Spinner className="h-8 w-8" />
          </div>
        )
      ) : events.length === 0 ? (
        <p className="mt-6 text-white/60">No meetings today.</p>
      ) : (
        <ul className="mt-6 divide-y divide-white/10">
          {events.map((event) => {
            const over = new Date(event.end).getTime() <= clock.now.getTime();
            const removing = removingId === event.id;
            return (
              <li
                key={event.id}
                className={cn('flex items-center gap-6 py-4', over && 'text-white/50')}
              >
                <div className="tabular w-56 shrink-0 text-lg font-semibold">
                  {event.isAllDay ? 'All day' : formatRange(event.start, event.end, tz)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-semibold">{event.title}</div>
                  {event.organizer && (
                    <div className="truncate text-sm text-white/50">{event.organizer}</div>
                  )}
                </div>
                {removing ? (
                  <Spinner className="h-5 w-5" />
                ) : confirmId === event.id ? (
                  <>
                    <Button variant="danger" onClick={() => remove(event)}>
                      <Check className="h-5 w-5" /> Remove
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmId(null)} aria-label="Cancel">
                      <X className="h-5 w-5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={removingId !== null}
                    onClick={() => setConfirmId(event.id)}
                    aria-label={`Remove "${event.title}"`}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
});
