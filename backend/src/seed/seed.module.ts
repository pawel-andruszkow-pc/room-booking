import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { CheckIn } from '../bookings/check-in.entity';
import { LocalEvent } from '../calendar/local-event.entity';
import { Device } from '../devices/device.entity';
import { Room } from '../rooms/room.entity';
import { AppSettings } from '../settings/app-settings.entity';
import { SeedService } from './seed.service';

/**
 * Standalone module for the seed CLI (see seed.ts). It wires up its own
 * database connection rather than depending on AppModule, so seeding never
 * starts the HTTP server, the guards or the cron job.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    TypeOrmModule.forFeature([Room, Device, AppSettings, LocalEvent, CheckIn]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
