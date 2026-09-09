import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One Google Calendar push channel (events.watch) per room calendar.
 *
 * Google posts an empty notification to our webhook whenever the calendar
 * changes; the row maps the channel back to the calendar and holds the secret
 * token that proves the notification is ours. Channels expire, so `expiresAt`
 * drives renewal. Keyed by calendarId rather than room so a room rename,
 * calendar swap or deletion is just a set difference during reconciliation.
 */
@Entity('calendar_watches')
export class CalendarWatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 300, unique: true })
  calendarId: string;

  /** Our channel id, generated per registration and echoed in X-Goog-Channel-ID. */
  @Column({ type: 'varchar', length: 64, unique: true })
  channelId: string;

  /** Google's id for the watched resource; required to stop the channel. */
  @Column({ type: 'varchar', length: 200 })
  resourceId: string;

  /** Webhook URL the channel was registered with; a changed PUBLIC_URL re-registers it. */
  @Column({ type: 'varchar', length: 500 })
  address: string;

  /** Random secret Google echoes in X-Goog-Channel-Token. */
  @Column({ type: 'varchar', length: 128 })
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
