import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from '../rooms/room.entity';

/**
 * A browser/tablet that opened the app. The id is generated client-side and
 * persisted in localStorage, so the same tablet keeps its assignment across
 * reloads. Assigning a room (and kiosk mode) happens on the settings page.
 */
@Entity('devices')
export class Device {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  @ManyToOne(() => Room, (room) => room.devices, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'roomId' })
  room: Room | null;

  /** True when this device is a wall tablet that should run in kiosk mode. */
  @Column({ type: 'boolean', default: false })
  isKiosk: boolean;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
