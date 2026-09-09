import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import {
  CalendarEvent,
  CalendarProvider,
  CalendarSummary,
  ConnectionTestResult,
  CreateEventInput,
  parseCapacity,
} from './calendar.types';
import { LocalEvent } from './local-event.entity';

/**
 * Database-backed calendar used when CALENDAR_PROVIDER=local. Behaves like a
 * real calendar (overlapping events, shortening, deleting) so the tablet flow
 * can be exercised end-to-end without Google credentials.
 */
@Injectable()
export class LocalCalendarProvider implements CalendarProvider {
  readonly name = 'local' as const;

  constructor(
    @InjectRepository(LocalEvent) private readonly events: Repository<LocalEvent>,
  ) {}

  /** Every calendar id that has at least one local event. */
  /** Any id is a valid local calendar; nothing to subscribe to. */
  async addCalendar(calendarId: string): Promise<CalendarSummary> {
    return {
      id: calendarId,
      summary: calendarId,
      description: null,
      location: null,
      capacity: parseCapacity(calendarId),
      canWrite: true,
    };
  }

  async listCalendars(): Promise<CalendarSummary[]> {
    const rows = await this.events
      .createQueryBuilder('e')
      .select('e.calendarId', 'calendarId')
      .distinct(true)
      .orderBy('e.calendarId', 'ASC')
      .getRawMany<{ calendarId: string }>();
    return rows.map((r) => ({
      id: r.calendarId,
      summary: r.calendarId,
      description: null,
      location: null,
      capacity: parseCapacity(r.calendarId),
      canWrite: true,
    }));
  }

  async listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const rows = await this.events.find({
      where: { calendarId, startsAt: LessThan(to), endsAt: MoreThan(from) },
      order: { startsAt: 'ASC' },
    });
    return rows.map(toCalendarEvent);
  }

  async createEvent(calendarId: string, input: CreateEventInput): Promise<CalendarEvent> {
    const row = await this.events.save(
      this.events.create({
        calendarId,
        title: input.title,
        description: input.description ?? null,
        organizer: null,
        startsAt: input.start,
        endsAt: input.end,
      }),
    );
    return toCalendarEvent(row);
  }

  async updateEventEnd(calendarId: string, eventId: string, end: Date): Promise<void> {
    const row = await this.events.findOne({ where: { id: eventId, calendarId } });
    if (!row) throw new NotFoundException(`Event ${eventId} not found`);
    row.endsAt = end;
    await this.events.save(row);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.events.delete({ id: eventId, calendarId });
  }

  async testConnection(calendarId: string): Promise<ConnectionTestResult> {
    const count = await this.events.count({ where: { calendarId } });
    return {
      ok: true,
      provider: 'local',
      summary: `${calendarId} (${count} local events)`,
    };
  }
}

function toCalendarEvent(row: LocalEvent): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    organizer: row.organizer,
    start: row.startsAt.toISOString(),
    end: row.endsAt.toISOString(),
    isAllDay: false,
    source: 'local',
    htmlLink: null,
  };
}
