import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { appConfig } from '../config/app-config';
import { Public } from '../common/public.decorator';
import { RequirePin } from '../common/require-pin.decorator';
import { CalendarService } from './calendar.service';
import {
  GOOGLE_WEBHOOK_ROUTE,
  GoogleNotificationHeaders,
  GoogleWatchService,
} from './google-watch.service';
import { AddCalendarDto } from './dto/add-calendar.dto';
import { CreateLocalEventDto } from './dto/create-local-event.dto';
import { TestCalendarDto } from './dto/test-calendar.dto';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly watch: GoogleWatchService,
  ) {}

  /** Which backend is active, which service account to share calendars with, push status. */
  @Get('provider')
  async provider() {
    return {
      provider: this.calendar.name,
      serviceAccountEmail: appConfig().calendar.google.serviceAccountEmail,
      impersonatedUser: appConfig().calendar.google.impersonateUser,
      push: await this.watch.status(),
    };
  }

  /**
   * Google Calendar push notifications. Google cannot send our Basic
   * credentials, so the route is public and authenticated by the per-channel
   * secret token instead (see GoogleWatchService). The body is always empty.
   */
  @Public()
  @Post(GOOGLE_WEBHOOK_ROUTE)
  @HttpCode(204)
  async googleWebhook(@Headers() headers: GoogleNotificationHeaders): Promise<void> {
    await this.watch.handleNotification(headers);
  }

  /** Calendars visible to the credentials — lets the admin import Workspace room resources. */
  @Get('calendars')
  @RequirePin('admin')
  calendars() {
    return this.calendar.listCalendars();
  }

  /**
   * Subscribes the credentials to a calendar by id so it appears in `calendars`.
   * Needed once per Google calendar: sharing alone never lists it for a service account.
   */
  @Post('calendars')
  @RequirePin('admin')
  addCalendar(@Body() dto: AddCalendarDto) {
    return this.calendar.addCalendar(dto.calendarId.trim());
  }

  /** Verify the backend can read a calendar (admin page "Test connection"). */
  @Post('test')
  @HttpCode(200)
  @RequirePin('admin')
  test(@Body() dto: TestCalendarDto) {
    return this.calendar.testConnection(dto.calendarId.trim());
  }

  /** Local provider only: create a demo event so a room shows as busy. */
  @Post('local/events')
  @RequirePin('admin')
  createLocalEvent(@Body() dto: CreateLocalEventDto) {
    if (this.calendar.name !== 'local') {
      throw new BadRequestException('Only available when CALENDAR_PROVIDER=local');
    }
    const start = new Date(dto.start);
    const end = new Date(dto.end);
    if (end <= start) throw new BadRequestException('end must be after start');
    return this.calendar.createEvent(dto.calendarId.trim(), {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      start,
      end,
    });
  }
}
