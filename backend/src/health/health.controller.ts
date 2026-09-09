import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/public.decorator';

/** Unauthenticated liveness/readiness probe for Railway and uptime monitors. */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'error';
    }
    return { status: database === 'ok' ? 'ok' : 'degraded', database, time: new Date() };
  }
}
