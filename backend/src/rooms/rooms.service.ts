import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Room } from './room.entity';
import { RoomEventsService } from './room-events.service';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    private readonly events: RoomEventsService,
  ) {}

  findAll(includeInactive = false): Promise<Room[]> {
    return this.rooms.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) throw new NotFoundException(`Room ${id} not found`);
    return room;
  }

  async create(dto: CreateRoomDto): Promise<Room> {
    await this.assertCalendarFree(dto.calendarId);
    const room = await this.rooms.save(this.rooms.create(normalize(dto)));
    this.events.emit();
    return room;
  }

  async update(id: string, dto: UpdateRoomDto): Promise<Room> {
    const room = await this.findOne(id);
    if (dto.calendarId && dto.calendarId !== room.calendarId) {
      await this.assertCalendarFree(dto.calendarId);
    }
    Object.assign(room, normalize(dto));
    const saved = await this.rooms.save(room);
    this.events.emit();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const room = await this.findOne(id);
    await this.rooms.remove(room);
    this.events.emit();
  }

  private async assertCalendarFree(calendarId: string): Promise<void> {
    const existing = await this.rooms.findOne({ where: { calendarId } });
    if (existing) {
      throw new ConflictException(
        `Calendar ${calendarId} is already used by "${existing.name}"`,
      );
    }
  }
}

/** Trim strings and turn empty optional strings into NULL. */
function normalize<T extends Partial<CreateRoomDto>>(dto: T): T {
  const out: any = { ...dto };
  if (typeof out.name === 'string') out.name = out.name.trim();
  if (typeof out.calendarId === 'string') out.calendarId = out.calendarId.trim();
  if (typeof out.location === 'string') out.location = out.location.trim() || null;
  return out;
}
