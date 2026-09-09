import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Save } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

/** PINs and behavioural settings (check-in window, polling, limits). */
export const SecurityTab = observer(function SecurityTab() {
  const { admin, auth, toast } = useStores();
  const s = admin.settings;

  const [settingsPin, setSettingsPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [checkInEnabled, setCheckInEnabled] = useState(s?.checkInEnabled ?? true);
  const [checkInMinutes, setCheckInMinutes] = useState(String(s?.checkInMinutes ?? 15));
  const [pollInterval, setPollInterval] = useState(String(s?.pollIntervalSeconds ?? 20));
  const [maxBooking, setMaxBooking] = useState(String(s?.maxBookingMinutes ?? 240));
  const [timezone, setTimezone] = useState(s?.timezone ?? 'Europe/Warsaw');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s) return;
    setCheckInEnabled(s.checkInEnabled);
    setCheckInMinutes(String(s.checkInMinutes));
    setPollInterval(String(s.pollIntervalSeconds));
    setMaxBooking(String(s.maxBookingMinutes));
    setTimezone(s.timezone);
  }, [s]);

  const save = async () => {
    setSaving(true);
    try {
      await admin.updateSettings({
        checkInEnabled,
        checkInMinutes: Number(checkInMinutes),
        pollIntervalSeconds: Number(pollInterval),
        maxBookingMinutes: Number(maxBooking),
        timezone: timezone.trim(),
        settingsPin: settingsPin.trim() || undefined,
        adminPin: adminPin.trim() || undefined,
      });
      // A changed PIN invalidates the one cached in this session.
      if (settingsPin) auth.lock('settings');
      if (adminPin) auth.lock('admin');
      setSettingsPin('');
      setAdminPin('');
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Could not save settings', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8">
      <Card>
        <CardTitle>PINs</CardTitle>
        <CardDescription>Leave a field empty to keep the current PIN. Exactly 4 digits.</CardDescription>
        <div className="mt-6 space-y-6">
          <div>
            <Label htmlFor="pin-settings">Settings PIN</Label>
            <Input
              id="pin-settings"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={settingsPin}
              onChange={(e) => setSettingsPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <p className="mt-2 text-white/50">Unlocks the device settings page on any tablet.</p>
          </div>
          <div>
            <Label htmlFor="pin-admin">Admin PIN</Label>
            <Input
              id="pin-admin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <p className="mt-2 text-white/50">Unlocks this admin page. Also accepted wherever the settings PIN is.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Behaviour</CardTitle>
        <CardDescription>Applies to every tablet on its next refresh.</CardDescription>
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between rounded-2xl bg-white/5 p-5">
            <div>
              <div className="text-lg font-semibold">Ask for presence confirmation</div>
              <div className="text-white/60">Release the room when nobody confirms in time.</div>
            </div>
            <Switch checked={checkInEnabled} onCheckedChange={setCheckInEnabled} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor="checkin-min">Confirmation window (min)</Label>
              <Input id="checkin-min" type="number" inputMode="numeric" min={1} max={120} value={checkInMinutes} onChange={(e) => setCheckInMinutes(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="poll">Refresh interval (s)</Label>
              <Input id="poll" type="number" inputMode="numeric" min={5} max={300} value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="maxbook">Max walk-in booking (min)</Label>
              <Input id="maxbook" type="number" inputMode="numeric" min={15} max={720} value={maxBooking} onChange={(e) => setMaxBooking(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tz">Timezone</Label>
              <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Warsaw" />
            </div>
          </div>
        </div>
      </Card>

      <div className="col-span-2 flex justify-end">
        <Button size="lg" variant="accent" disabled={saving} onClick={save}>
          {saving ? <Spinner /> : <Save className="h-6 w-6" />} Save settings
        </Button>
      </div>
    </div>
  );
});
