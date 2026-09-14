import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optimistic-lock token on presence records. "I'm already here" can be taken
 * back from the tablet, and that cancel has to act on the row the screen was
 * showing: pinning the version lets a concurrent write (the meeting starting
 * and opening its own prompt, a second tablet in the same room) be detected
 * rather than silently discarded.
 *
 * Existing rows start at 1, which is where TypeORM starts a fresh one too.
 */
export class CheckInVersion1789700000000 implements MigrationInterface {
  name = 'CheckInVersion1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "check_ins" ADD "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "check_ins" DROP COLUMN "version"`);
  }
}
