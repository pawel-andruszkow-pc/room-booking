import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarModule } from '../calendar/calendar.module';
import { DevicesModule } from '../devices/devices.module';
import { RoomsModule } from '../rooms/rooms.module';
import { AutoReleaseService } from './auto-release.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CheckIn } from './check-in.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckIn]),
    CalendarModule,
    RoomsModule,
    DevicesModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, AutoReleaseService],
})
export class BookingsModule {}
