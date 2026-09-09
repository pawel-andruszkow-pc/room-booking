import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig } from '../config/app-config';
import { RoomsModule } from '../rooms/rooms.module';
import { CalendarChangesService } from './calendar-changes.service';
import { CalendarWatch } from './calendar-watch.entity';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CALENDAR_PROVIDER, CalendarProvider } from './calendar.types';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { GoogleWatchService } from './google-watch.service';
import { LocalCalendarProvider } from './local-calendar.provider';
import { LocalEvent } from './local-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LocalEvent, CalendarWatch]), RoomsModule],
  controllers: [CalendarController],
  providers: [
    LocalCalendarProvider,
    GoogleCalendarProvider,
    {
      // CALENDAR_PROVIDER decides which backend serves the app.
      provide: CALENDAR_PROVIDER,
      inject: [LocalCalendarProvider, GoogleCalendarProvider],
      useFactory: (
        local: LocalCalendarProvider,
        google: GoogleCalendarProvider,
      ): CalendarProvider =>
        appConfig().calendar.provider === 'google' ? google : local,
    },
    CalendarService,
    CalendarChangesService,
    GoogleWatchService,
  ],
  exports: [CalendarService, CalendarChangesService],
})
export class CalendarModule {}
