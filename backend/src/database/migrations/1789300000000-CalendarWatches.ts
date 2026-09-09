import { MigrationInterface, QueryRunner } from 'typeorm';

/** Google Calendar push channels registered by GoogleWatchService. */
export class CalendarWatches1789300000000 implements MigrationInterface {
  name = 'CalendarWatches1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_watches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "calendarId" character varying(300) NOT NULL,
        "channelId" character varying(64) NOT NULL,
        "resourceId" character varying(200) NOT NULL,
        "address" character varying(500) NOT NULL,
        "token" character varying(128) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_calendar_watches_calendarId" UNIQUE ("calendarId"),
        CONSTRAINT "UQ_calendar_watches_channelId" UNIQUE ("channelId"),
        CONSTRAINT "PK_calendar_watches" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "calendar_watches"`);
  }
}
