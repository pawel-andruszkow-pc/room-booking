import { MigrationInterface, QueryRunner } from 'typeorm';

/** Local provider: an event can be a full-day reservation, like Google's all-day events. */
export class LocalAllDayEvents1789500000000 implements MigrationInterface {
  name = 'LocalAllDayEvents1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "local_events" ADD "isAllDay" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "local_events" DROP COLUMN "isAllDay"`);
  }
}
