import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1789200000000 implements MigrationInterface {
  name = 'InitSchema1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "rooms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "calendarId" character varying(300) NOT NULL,
        "location" character varying(200),
        "capacity" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_rooms_calendarId" UNIQUE ("calendarId"),
        CONSTRAINT "PK_rooms" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "devices" (
        "id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "roomId" uuid,
        "isKiosk" boolean NOT NULL DEFAULT false,
        "userAgent" text,
        "lastSeenAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_devices_room" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "app_settings" (
        "id" integer NOT NULL DEFAULT 1,
        "settingsPin" character varying(16) NOT NULL,
        "adminPin" character varying(16) NOT NULL,
        "checkInEnabled" boolean NOT NULL DEFAULT true,
        "checkInMinutes" integer NOT NULL DEFAULT 15,
        "timezone" character varying(64) NOT NULL DEFAULT 'Europe/Warsaw',
        "pollIntervalSeconds" integer NOT NULL DEFAULT 20,
        "maxBookingMinutes" integer NOT NULL DEFAULT 240,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "local_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "calendarId" character varying(300) NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "organizer" character varying(200),
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_local_events" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_local_events_calendar_start" ON "local_events" ("calendarId", "startsAt")`,
    );

    await queryRunner.query(
      `CREATE TABLE "check_ins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "roomId" uuid NOT NULL,
        "eventId" character varying(300) NOT NULL,
        "eventStartsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "releasedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_check_ins_room_event" UNIQUE ("roomId", "eventId"),
        CONSTRAINT "PK_check_ins" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "check_ins"`);
    await queryRunner.query(`DROP INDEX "IDX_local_events_calendar_start"`);
    await queryRunner.query(`DROP TABLE "local_events"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "rooms"`);
  }
}
