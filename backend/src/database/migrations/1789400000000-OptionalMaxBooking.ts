import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The walk-in booking limit becomes optional: empty means a walk-in may take
 * the room until the next meeting. Rows still on the old built-in default
 * (240) are cleared, since nobody chose that value.
 */
export class OptionalMaxBooking1789400000000 implements MigrationInterface {
  name = 'OptionalMaxBooking1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "maxBookingMinutes" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "maxBookingMinutes" SET DEFAULT NULL`,
    );
    await queryRunner.query(
      `UPDATE "app_settings" SET "maxBookingMinutes" = NULL WHERE "maxBookingMinutes" = 240`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "app_settings" SET "maxBookingMinutes" = 240 WHERE "maxBookingMinutes" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "maxBookingMinutes" SET DEFAULT 240`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ALTER COLUMN "maxBookingMinutes" SET NOT NULL`,
    );
  }
}
