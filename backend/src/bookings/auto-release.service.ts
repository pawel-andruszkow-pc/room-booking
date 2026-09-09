import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

/**
 * Safety net for the presence check: even if the tablet loses power after the
 * prompt appeared, unconfirmed meetings are released once the deadline passes.
 */
@Injectable()
export class AutoReleaseService {
  private readonly logger = new Logger(AutoReleaseService.name);
  private running = false;

  constructor(private readonly bookings: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.running) return; // skip a tick if the previous one is still talking to Google
    this.running = true;
    try {
      const released = await this.bookings.releaseExpired();
      if (released > 0) this.logger.log(`Auto-released ${released} room(s)`);
    } finally {
      this.running = false;
    }
  }
}
