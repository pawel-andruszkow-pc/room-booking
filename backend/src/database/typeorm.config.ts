import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { Room } from '../rooms/room.entity';
import { Device } from '../devices/device.entity';
import { AppSettings } from '../settings/app-settings.entity';
import { LocalEvent } from '../calendar/local-event.entity';
import { CheckIn } from '../bookings/check-in.entity';

/**
 * Single source of truth for the database connection, shared by the NestJS
 * app (see app.module.ts), the seed CLI and the TypeORM CLI (see data-source.ts).
 *
 * The connection is configured entirely via DATABASE_URL — the variable
 * Railway's Postgres plugin provides (reference it as ${{Postgres.DATABASE_URL}}).
 * Locally it points at the docker-compose database. SSL, when a managed
 * provider needs it, is requested through the URL itself (`?sslmode=require`).
 *
 * Schema changes are managed exclusively through migrations — `synchronize`
 * is always false.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Point it at your Postgres instance ' +
        '(on Railway, reference ${{Postgres.DATABASE_URL}}).',
    );
  }

  return {
    type: 'postgres',
    url,
    entities: [Room, Device, AppSettings, LocalEvent, CheckIn],
    // Matches both compiled (.js) and ts-node (.ts) runs.
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
  };
}
