import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { appConfig } from '../config/app-config';
import { RequirePin } from '../common/require-pin.decorator';
import { CalendarService } from './calendar.service';
import { CreateLocalEventDto } from './dto/create-local-event.dto';
import { TestCalendarDto } from './dto/test-calendar.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** Which backend is active and which service account to share calendars with. */
  @Get('provider')
  provider() {
    return {
      provider: this.calendar.name,
      serviceAccountEmail: appConfig().calendar.google.serviceAccountEmail,
      impersonatedUser: appConfig().calendar.google.impersonateUser,
    };
  }

  /** Calendars visible to the credentials — lets the admin import Workspace room resources. */
  @Get('calendars')
  @RequirePin('admin')
  calendars() {
    return this.calendar.listCalendars();
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
