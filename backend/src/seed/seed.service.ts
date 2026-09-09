import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addMinutes, subMinutes } from 'date-fns';
import { CheckIn } from '../bookings/check-in.entity';
import { LocalEvent } from '../calendar/local-event.entity';
import { Device } from '../devices/device.entity';
import { Room } from '../rooms/room.entity';
import { AppSettings } from '../settings/app-settings.entity';

interface SeedRoom {
  name: string;
  calendarId: string;
}

const DEFAULT_ROOMS: SeedRoom[] = [
  { name: 'Yellow', calendarId: 'yellow@local' },
  { name: 'Violet', calendarId: 'violet@local' },
  { name: 'Palmiarnia', calendarId: 'palmiarnia@local' },
];

const LOCATIONS = ['6th floor', '6th floor', '6th floor'];
const CAPACITIES = [4, 4, 2];

/** Demo meetings relative to "now" so every room state can be seen right away. */
function demoAgenda(
  now: Date,
  index: number,
): Array<Pick<LocalEvent, 'title' | 'organizer' | 'startsAt' | 'endsAt'>> {
  switch (index % 3) {
    case 0:
      // Room 1: busy right now, then a gap, then more meetings.
      return [
        {
          title: 'Knowledge sharing box',
          organizer: 'Anna Kowalska',
          startsAt: subMinutes(now, 20),
          endsAt: addMinutes(now, 40),
        },
        {
          title: 'Cross-Team Meeting',
          organizer: 'Marek Nowak',
          startsAt: addMinutes(now, 90),
          endsAt: addMinutes(now, 150),
        },
        {
          title: 'Izidrop - planowanie',
          organizer: 'Anna Kowalska',
          startsAt: addMinutes(now, 240),
          endsAt: addMinutes(now, 300),
        },
      ];
    case 1:
      // Room 2: free now, next meeting in 45 minutes.
      return [
        {
          title: 'Wotkshops with Softnet',
          organizer: 'Ola Zielińska',
          startsAt: addMinutes(now, 45),
          endsAt: addMinutes(now, 75),
        },
        {
          title: 'Mateusz / Marcin',
          organizer: 'Tomasz Lis',
          startsAt: addMinutes(now, 120),
          endsAt: addMinutes(now, 150),
        },
      ];
    default:
      // Room 3: a meeting that just started → triggers the presence prompt.
      return [
        {
          title: 'IziDrop - Review',
          organizer: 'Piotr Wiśniewski',
          startsAt: subMinutes(now, 2),
          endsAt: addMinutes(now, 28),
        },
      ];
  }
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(AppSettings) private readonly settings: Repository<AppSettings>,
    @InjectRepository(LocalEvent) private readonly events: Repository<LocalEvent>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
  ) {}

  /**
   * Creates the rooms listed in SEED_ROOMS (idempotent: matched by calendarId)
   * and, for the local calendar provider, a fresh set of demo meetings around
   * the current time. With --reset everything is wiped first.
   */
  async run(opts: { reset: boolean }): Promise<void> {
    if (opts.reset) {
      await this.checkIns.createQueryBuilder().delete().execute();
      await this.events.createQueryBuilder().delete().execute();
      await this.devices.createQueryBuilder().delete().execute();
      await this.rooms.createQueryBuilder().delete().execute();
      this.logger.log('Cleared rooms, devices, local events and check-ins.');
    }

    await this.ensureSettings();

    const seedRooms = parseSeedRooms(process.env.SEED_ROOMS);
    const rooms: Room[] = [];
    for (const [index, seed] of seedRooms.entries()) {
      let room = await this.rooms.findOne({ where: { calendarId: seed.calendarId } });
      if (!room) {
        room = this.rooms.create({
          name: seed.name,
          calendarId: seed.calendarId,
          location: LOCATIONS[index % LOCATIONS.length],
          capacity: CAPACITIES[index % CAPACITIES.length],
          isActive: true,
        });
        room = await this.rooms.save(room);
        this.logger.log(`Created room "${room.name}" (${room.calendarId})`);
      }
      rooms.push(room);
    }

    if ((process.env.CALENDAR_PROVIDER ?? 'local') !== 'local') {
      this.logger.log(
        'CALENDAR_PROVIDER=google — skipping demo events (they live in Google Calendar).',
      );
      return;
    }

    const now = new Date();
    for (const [index, room] of rooms.entries()) {
      // Replace demo events so re-running always yields meetings around "now".
      await this.events.delete({ calendarId: room.calendarId });
      await this.checkIns.delete({ roomId: room.id });
      const agenda = demoAgenda(now, index);
      await this.events.save(
        agenda.map((e) =>
          this.events.create({
            ...e,
            calendarId: room.calendarId,
            description: 'Seeded demo meeting',
          }),
        ),
      );
      this.logger.log(`Seeded ${agenda.length} demo meeting(s) for "${room.name}"`);
    }
  }

  private async ensureSettings(): Promise<void> {
    const existing = await this.settings.findOne({ where: { id: 1 } });
    if (existing) return;
    await this.settings.save(
      this.settings.create({
        id: 1,
        settingsPin: process.env.SETTINGS_PIN?.trim() || '1234',
        adminPin: process.env.ADMIN_PIN?.trim() || '0000',
        timezone: process.env.TIMEZONE?.trim() || 'Europe/Warsaw',
      }),
    );
    this.logger.log('Created default app settings.');
  }
}

/** Parses `Name=calendarId,Name=calendarId`; falls back to three demo rooms. */
function parseSeedRooms(raw?: string): SeedRoom[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      if (idx < 0) return null;
      const name = pair.slice(0, idx).trim();
      const calendarId = pair.slice(idx + 1).trim();
      return name && calendarId ? { name, calendarId } : null;
    })
    .filter((r): r is SeedRoom => r !== null);
  return parsed.length > 0 ? parsed : DEFAULT_ROOMS;
}
