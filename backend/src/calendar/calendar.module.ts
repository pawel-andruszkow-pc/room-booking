import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CALENDAR_PROVIDER, CalendarProvider } from './calendar.types';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { LocalCalendarProvider } from './local-calendar.provider';
import { LocalEvent } from './local-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LocalEvent])],
  controllers: [CalendarController],
  providers: [
    LocalCalendarProvider,
    GoogleCalendarProvider,
    {
      // CALENDAR_PROVIDER env decides which backend serves the app.
      provide: CALENDAR_PROVIDER,
      inject: [LocalCalendarProvider, GoogleCalendarProvider],
      useFactory: (
        local: LocalCalendarProvider,
        google: GoogleCalendarProvider,
      ): CalendarProvider =>
        process.env.CALENDAR_PROVIDER === 'google' ? google : local,
    },
    CalendarService,
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
