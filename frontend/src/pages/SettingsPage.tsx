import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { Expand, LogOut, Lock, Save } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { useKiosk } from '@/hooks/useKiosk';
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
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';

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
  const { device, admin, auth, room, toast } = useStores();
  const navigate = useNavigate();
  const { requestFullscreen } = useKiosk(false);

  const [name, setName] = useState(device.device?.name ?? '');
  const [roomId, setRoomId] = useState<string>(device.roomId ?? NONE);
  const [isKiosk, setIsKiosk] = useState(device.isKiosk);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    admin.loadRooms().catch((err) => toast.error('Could not load rooms', (err as Error).message));
  }, [admin, toast]);

  const dirty =
    name !== (device.device?.name ?? '') ||
    (roomId === NONE ? null : roomId) !== device.roomId ||
    isKiosk !== device.isKiosk;

  // Optimistic: DeviceStore applies the assignment locally first, so the room
  // screen can open immediately; a failure restores the previous assignment.
  const save = () => {
    setSaving(true);
    device
      .update(
        {
          name: name.trim() || undefined,
          roomId: roomId === NONE ? null : roomId,
          isKiosk,
        },
        admin.rooms,
      )
      .then(() => toast.success('Device settings saved'))
      .catch((err: Error) => toast.error('Could not save, reverted', err.message))
      .finally(() => setSaving(false));
    if (isKiosk) void requestFullscreen();
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
          <CardDescription>
            Assign a room and decide whether this is a wall-mounted tablet.
          </CardDescription>

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

            <div className="flex items-center justify-between rounded-2xl bg-white/5 p-6">
              <div>
                <div className="text-xl font-semibold">This device is a tablet (kiosk mode)</div>
                <div className="text-white/60">
                  Fullscreen, screen always on, no cursor. Tap the clock 5 times to come back here.
                </div>
              </div>
              <Switch checked={isKiosk} onCheckedChange={setIsKiosk} aria-label="Kiosk mode" />
            </div>
          </div>

          <div className="mt-10 flex gap-4">
            <Button size="lg" variant="accent" disabled={!dirty || saving} onClick={save}>
              {saving ? <Spinner /> : <Save className="h-6 w-6" />} Save
            </Button>
            <Button size="lg" variant="secondary" onClick={() => void requestFullscreen()}>
              <Expand className="h-6 w-6" /> Enter fullscreen
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
        </div>
      </div>
    </PageShell>
  );
});
