import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { CalendarCog, DoorOpen, Lock, ShieldCheck, TabletSmartphone } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { PageShell } from '@/components/PageShell';
import { PinGate } from '@/components/PinGate';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoomsTab } from './RoomsTab';
import { DevicesTab } from './DevicesTab';
import { CalendarTab } from './CalendarTab';
import { SecurityTab } from './SecurityTab';

export function AdminPage() {
  return (
    <PinGate scope="admin" title="Administration" description="Enter the admin PIN">
      <AdminContent />
    </PinGate>
  );
}

const AdminContent = observer(function AdminContent() {
  const { admin, auth, room } = useStores();

  useEffect(() => {
    void admin.loadAll();
  }, [admin]);

  return (
    <PageShell
      title="Administration"
      subtitle="Rooms, devices, calendar connection and security"
      backTo="/settings"
      timezone={admin.settings?.timezone ?? room.timezone}
      actions={
        <Button variant="ghost" onClick={() => auth.lock('admin')}>
          <Lock className="h-5 w-5" /> Lock
        </Button>
      }
    >
      {admin.error && (
        <div className="mb-6 rounded-2xl border border-red-400/40 bg-red-400/10 p-5 text-lg text-red-200">
          {admin.error}
        </div>
      )}
      {admin.loading && !admin.settings ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <Tabs defaultValue="rooms">
          <TabsList>
            <TabsTrigger value="rooms">
              <DoorOpen className="h-5 w-5" /> Rooms
            </TabsTrigger>
            <TabsTrigger value="devices">
              <TabletSmartphone className="h-5 w-5" /> Devices
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarCog className="h-5 w-5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="security">
              <ShieldCheck className="h-5 w-5" /> Security
            </TabsTrigger>
          </TabsList>
          <TabsContent value="rooms">
            <RoomsTab />
          </TabsContent>
          <TabsContent value="devices">
            <DevicesTab />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarTab />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
});
