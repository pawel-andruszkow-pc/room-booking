import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The presence-confirmation window drops from 15 to 10 minutes: a quarter of
 * an hour is long enough that a room nobody turned up for stays blocked for
 * most of a short meeting. Rows still on the old built-in default are moved
 * with it, since nobody chose that value.
 */
export class ShorterCheckInWindow1789600000000 implements MigrationInterface {
  name = 'ShorterCheckInWindow1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "checkInMinutes" SET DEFAULT 10`,
    );
    await queryRunner.query(
      `UPDATE "app_settings" SET "checkInMinutes" = 10 WHERE "checkInMinutes" = 15`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "app_settings" SET "checkInMinutes" = 15 WHERE "checkInMinutes" = 10`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "checkInMinutes" SET DEFAULT 15`,
    );
  }
}
