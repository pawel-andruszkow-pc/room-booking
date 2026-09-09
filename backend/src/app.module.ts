import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database/typeorm.config';
import { BasicAuthGuard } from './common/basic-auth.guard';
import { PinGuard } from './common/pin.guard';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CalendarModule } from './calendar/calendar.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health/health.controller';
import { RoomsModule } from './rooms/rooms.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ConfigModule loads .env into process.env before this factory runs.
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    ScheduleModule.forRoot(),
    SettingsModule,
    AuthModule,
    RoomsModule,
    DevicesModule,
    CalendarModule,
    BookingsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: Basic credentials first, then the optional PIN check.
    { provide: APP_GUARD, useClass: BasicAuthGuard },
    { provide: APP_GUARD, useClass: PinGuard },
  ],
})
export class AppModule {}
