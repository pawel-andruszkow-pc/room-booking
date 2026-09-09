import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pencil, Plug, Plus, Trash2, X } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import type { Room } from '@/types';

interface RoomDraft {
  name: string;
  calendarId: string;
  location: string;
  capacity: string;
  isActive: boolean;
}

const EMPTY: RoomDraft = { name: '', calendarId: '', location: '', capacity: '', isActive: true };

function toDraft(room: Room): RoomDraft {
  return {
    name: room.name,
    calendarId: room.calendarId,
    location: room.location ?? '',
    capacity: room.capacity?.toString() ?? '',
    isActive: room.isActive,
  };
}

function toBody(draft: RoomDraft): Partial<Room> {
  return {
    name: draft.name.trim(),
    calendarId: draft.calendarId.trim(),
    location: draft.location.trim() || null,
    capacity: draft.capacity.trim() ? Number(draft.capacity) : null,
    isActive: draft.isActive,
  };
}

/** Define rooms and connect each to a calendar id. Editing happens inline, not in a modal. */
export const RoomsTab = observer(function RoomsTab() {
  const { admin, toast } = useStores();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = async (id: string | null, draft: RoomDraft) => {
    const body = toBody(draft);
    if (!body.name || !body.calendarId) {
      toast.error('Name and calendar id are required');
      return;
    }
    try {
      if (id) {
        await admin.updateRoom(id, body);
        setEditingId(null);
      } else {
        await admin.createRoom(body);
        setCreating(false);
      }
      toast.success(`Room "${body.name}" saved`);
    } catch (err) {
      toast.error('Could not save room', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-lg text-white/60">
          {admin.rooms.length} room{admin.rooms.length === 1 ? '' : 's'}. Each room reads one calendar.
        </p>
        <Button variant="accent" onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="h-5 w-5" /> Add room
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            key="new"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <RoomEditor
              initial={EMPTY}
              onCancel={() => setCreating(false)}
              onSave={(draft) => save(null, draft)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {admin.rooms.map((room) =>
        editingId === room.id ? (
          <RoomEditor
            key={room.id}
            initial={toDraft(room)}
            onCancel={() => setEditingId(null)}
            onSave={(draft) => save(room.id, draft)}
          />
        ) : (
          <RoomRow key={room.id} room={room} onEdit={() => setEditingId(room.id)} />
        ),
      )}
    </div>
  );
});

const RoomRow = observer(function RoomRow({ room, onEdit }: { room: Room; onEdit: () => void }) {
  const { admin, toast } = useStores();
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const devices = admin.devices.filter((d) => d.roomId === room.id);

  const test = async () => {
    setTesting(true);
    try {
      const result = await admin.testCalendar(room.calendarId);
      if (result.ok) toast.success('Calendar reachable', result.summary);
      else toast.error('Calendar test failed', result.error);
    } catch (err) {
      toast.error('Calendar test failed', (err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    try {
      await admin.deleteRoom(room.id);
      toast.success(`Room "${room.name}" deleted`);
    } catch (err) {
      toast.error('Could not delete room', (err as Error).message);
    }
  };

  return (
    <Card className="flex items-center gap-8 py-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{room.name}</span>
          {!room.isActive && <Badge variant="warning">inactive</Badge>}
          {room.capacity && <Badge>{room.capacity} seats</Badge>}
          {devices.length > 0 && <Badge variant="info">{devices.length} device{devices.length > 1 ? 's' : ''}</Badge>}
        </div>
        <div className="mt-1 truncate font-mono text-sm text-white/50">{room.calendarId}</div>
        {room.location && <div className="mt-1 text-white/60">{room.location}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" onClick={test} disabled={testing}>
          {testing ? <Spinner className="h-5 w-5" /> : <Plug className="h-5 w-5" />} Test
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          <Pencil className="h-5 w-5" /> Edit
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="danger" onClick={remove}>
              <Check className="h-5 w-5" /> Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              <X className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete room">
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>
    </Card>
  );
});

function RoomEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: RoomDraft;
  onSave: (draft: RoomDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RoomDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Card className="border-sky-400/40">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Label htmlFor="room-name">Room name</Label>
          <Input id="room-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </div>
        <div>
          <Label htmlFor="room-calendar">Calendar id</Label>
          <Input
            id="room-calendar"
            placeholder="c_abc123@resource.calendar.google.com"
            value={draft.calendarId}
            onChange={(e) => set({ calendarId: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="room-location">Location</Label>
          <Input
            id="room-location"
            placeholder="6th floor"
            value={draft.location}
            onChange={(e) => set({ location: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="room-capacity">Capacity</Label>
          <Input
            id="room-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.capacity}
            onChange={(e) => set({ capacity: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <label className="flex items-center gap-4 text-lg">
          <Switch checked={draft.isActive} onCheckedChange={(v) => set({ isActive: v })} />
          Active (shown on tablets)
        </label>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Spinner className="h-5 w-5" /> : <Check className="h-5 w-5" />} Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
