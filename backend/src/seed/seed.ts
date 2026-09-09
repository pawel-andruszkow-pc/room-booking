import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { appConfig } from '../config/app-config';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

/**
 * Seed CLI entry point. Boots an application context (no HTTP server), runs the
 * seeder, and exits non-zero on failure so it can be chained in scripts.
 *
 *   pnpm seed            # rooms from SEED_ROOMS + demo meetings (local provider)
 *   pnpm seed -- --reset # wipe rooms, devices, local events and check-ins first
 */
async function seed() {
  // Fail fast on a bad .env before opening a database connection.
  appConfig();

  const reset = process.argv.includes('--reset');

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    await app.get(SeedService).run({ reset });
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  new Logger('Seed').error(err);
  process.exit(1);
});
