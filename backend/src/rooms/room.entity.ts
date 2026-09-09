import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../devices/device.entity';

/** A bookable meeting room backed by one calendar. */
@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Google Calendar id (or any unique string for the local provider). */
  @Column({ type: 'varchar', length: 300, unique: true })
  calendarId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Device, (device) => device.room)
  devices: Device[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
