import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Calendar event stored in the local database. Used by the "local" calendar
 * provider so the whole app can be developed and demoed without a Google
 * account. Mirrors the subset of Google Calendar fields the app needs.
 */
@Entity('local_events')
@Index(['calendarId', 'startsAt'])
export class LocalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 300 })
  calendarId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  organizer: string | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  /** A full-day reservation; startsAt/endsAt then bound the day. */
  @Column({ type: 'boolean', default: false })
  isAllDay: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
