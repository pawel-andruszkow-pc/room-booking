import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomsService } from '../rooms/rooms.service';
import { Device } from './device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly rooms: RoomsService,
  ) {}

  findAll(): Promise<Device[]> {
    return this.devices.find({ relations: { room: true }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.devices.findOne({
      where: { id },
      relations: { room: true },
    });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device;
  }

  /**
   * Upserts the device on every app start: creates it on first visit, then
   * just bumps lastSeenAt (and the user agent) so the admin can see which
   * tablets are alive. The assignment (roomId/isKiosk) is never touched here.
   */
  async register(dto: RegisterDeviceDto): Promise<Device> {
    let device = await this.devices.findOne({ where: { id: dto.id } });
    if (!device) {
      device = this.devices.create({
        id: dto.id,
        name: dto.name?.trim() || `Device ${dto.id.slice(0, 8)}`,
        roomId: null,
        isKiosk: false,
      });
    }
    device.userAgent = dto.userAgent ?? device.userAgent ?? null;
    device.lastSeenAt = new Date();
    await this.devices.save(device);
    return this.findOne(dto.id);
  }

  async update(id: string, dto: UpdateDeviceDto): Promise<Device> {
    // Load WITHOUT the room relation: TypeORM derives the FK from a loaded
    // relation object on save, so a stale `room` would silently overwrite the
    // new `roomId` and the tablet would keep showing the previous room.
    const device = await this.devices.findOne({ where: { id } });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    if (dto.roomId !== undefined) {
      if (dto.roomId !== null) await this.rooms.findOne(dto.roomId); // 404 if unknown
      device.roomId = dto.roomId;
    }
    if (dto.name !== undefined) device.name = dto.name.trim();
    if (dto.isKiosk !== undefined) device.isKiosk = dto.isKiosk;
    await this.devices.save(device);
    return this.findOne(id);
  }

  async touch(id: string): Promise<void> {
    await this.devices.update({ id }, { lastSeenAt: new Date() });
  }

  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);
    await this.devices.remove(device);
  }
}
