import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

/**
 * DataSource used by the TypeORM CLI (migration:generate/run/revert).
 * Run via the pnpm scripts, e.g.:
 *   pnpm migration:generate -- src/database/migrations/AddSomething
 *   pnpm migration:run
 */
const dataSource = new DataSource(buildDataSourceOptions());

export default dataSource;
