import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';

/**
 * Presence tracking for one calendar event in one room. A row is created when
 * the event starts and the tablet asks "Is this meeting taking place?".
 *  - confirmedAt set  -> somebody pressed "Yes" (or the booking was made on the tablet).
 *  - releasedAt set   -> nobody confirmed in time (or "No" was pressed) and the room
 *                        was freed by shortening/removing the event.
 */
@Entity('check_ins')
@Unique(['roomId', 'eventId'])
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  roomId: string;

  @Column({ type: 'varchar', length: 300 })
  eventId: string;

  @Column({ type: 'timestamptz' })
  eventStartsAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /**
   * Bumped by TypeORM on every write. Callers that need to act on the row they
   * last read pin it (see BookingsService.cancelUpcoming): the statement is
   * scoped to this value, so a write that raced them changes nothing instead of
   * quietly overwriting their answer.
   */
  @VersionColumn()
  version: number;
}
