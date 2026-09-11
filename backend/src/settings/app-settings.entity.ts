import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Single-row table (id = 1) holding editable application settings. */
@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  /** PIN that unlocks the per-device settings page. */
  @Column({ type: 'varchar', length: 16 })
  settingsPin: string;

  /** PIN that unlocks the admin page and admin API routes. */
  @Column({ type: 'varchar', length: 16 })
  adminPin: string;

  /** Ask for presence confirmation when a meeting starts. */
  @Column({ type: 'boolean', default: true })
  checkInEnabled: boolean;

  /** Minutes after the meeting start before an unconfirmed room is released. */
  @Column({ type: 'int', default: 15 })
  checkInMinutes: number;

  /** IANA timezone used for day boundaries. */
  @Column({ type: 'varchar', length: 64, default: 'Europe/Warsaw' })
  timezone: string;

  /** How often tablets refresh room status. */
  @Column({ type: 'int', default: 20 })
  pollIntervalSeconds: number;

  /** Longest ad-hoc booking a tablet may create, in minutes; null = no limit. */
  @Column({ type: 'int', nullable: true, default: null })
  maxBookingMinutes: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
