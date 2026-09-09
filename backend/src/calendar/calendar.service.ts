import { Inject, Injectable } from '@nestjs/common';
import {
  CALENDAR_PROVIDER,
  CalendarEvent,
  CalendarProvider,
  CalendarSummary,
  ConnectionTestResult,
  CreateEventInput,
} from './calendar.types';

/** Thin facade over the configured provider so feature modules never import a concrete one. */
@Injectable()
export class CalendarService implements CalendarProvider {
  constructor(@Inject(CALENDAR_PROVIDER) private readonly provider: CalendarProvider) {}

  get name() {
    return this.provider.name;
  }

  listCalendars(): Promise<CalendarSummary[]> {
    return this.provider.listCalendars();
  }

  listEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    return this.provider.listEvents(calendarId, from, to);
  }

  createEvent(calendarId: string, input: CreateEventInput): Promise<CalendarEvent> {
    return this.provider.createEvent(calendarId, input);
  }

  updateEventEnd(calendarId: string, eventId: string, end: Date): Promise<void> {
    return this.provider.updateEventEnd(calendarId, eventId, end);
  }

  deleteEvent(calendarId: string, eventId: string): Promise<void> {
    return this.provider.deleteEvent(calendarId, eventId);
  }

  testConnection(calendarId: string): Promise<ConnectionTestResult> {
    return this.provider.testConnection(calendarId);
  }
}
