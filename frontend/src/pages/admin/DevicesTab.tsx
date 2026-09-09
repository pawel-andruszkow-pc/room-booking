import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { formatDistanceToNow } from 'date-fns';
import { Check, Trash2, X } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Device } from '@/types';

const NONE = '__none__';

/** Every browser that ever opened the app, with its room assignment. */
export const DevicesTab = observer(function DevicesTab() {
  const { admin } = useStores();

  if (admin.devices.length === 0) {
    return <p className="text-lg text-white/60">No devices registered yet. Open the app on a tablet to register it.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-lg text-white/60">
        Changes here apply immediately. Tablets pick up a new room on their next status refresh.
      </p>
      {admin.devices.map((device) => (
        <DeviceRow key={device.id} device={device} />
      ))}
    </div>
  );
});

const DeviceRow = observer(function DeviceRow({ device }: { device: Device }) {
  const { admin, toast, device: me } = useStores();
  const [name, setName] = useState(device.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isThisDevice = device.id === me.deviceId;

  const update = async (patch: { name?: string; roomId?: string | null; isKiosk?: boolean }) => {
    try {
      await admin.updateDevice(device.id, patch);
      if (isThisDevice) await me.register();
    } catch (err) {
      toast.error('Could not update device', (err as Error).message);
    }
  };

  const remove = async () => {
    try {
      await admin.deleteDevice(device.id);
      toast.success('Device removed');
    } catch (err) {
      toast.error('Could not remove device', (err as Error).message);
    }
  };

  return (
    <Card className="grid grid-cols-[1.2fr_1fr_auto_auto_auto] items-center gap-6 py-5">
      <div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== device.name && update({ name: name.trim() })}
          aria-label="Device name"
        />
        <div className="mt-2 flex items-center gap-2 text-sm text-white/50">
          {isThisDevice && <Badge variant="info">this device</Badge>}
          <span>
            seen{' '}
            {device.lastSeenAt
              ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })
              : 'never'}
          </span>
        </div>
      </div>
      <Select value={device.roomId ?? NONE} onValueChange={(v) => update({ roomId: v === NONE ? null : v })}>
        <SelectTrigger aria-label="Room">
          <SelectValue placeholder="Room" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Not assigned —</SelectItem>
          {admin.rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-3 text-lg">
        <Switch checked={device.isKiosk} onCheckedChange={(v) => update({ isKiosk: v })} />
        Kiosk
      </label>
      <div className="max-w-[16rem] truncate text-sm text-white/40" title={device.userAgent ?? ''}>
        {shortAgent(device.userAgent)}
      </div>
      <div className="flex gap-2">
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={remove}>
              <Check className="h-4 w-4" /> Remove
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Remove device">
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>
    </Card>
  );
});

function shortAgent(ua: string | null): string {
  if (!ua) return '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPad|iPhone/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return ua.slice(0, 24);
}
