import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePin } from '../common/require-pin.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** All devices with their room — admin overview. */
  @Get()
  @RequirePin('admin')
  findAll() {
    return this.devices.findAll();
  }

  /** Called on every app start; returns the device with its current assignment. */
  @Post('register')
  @HttpCode(200)
  register(@Body() dto: RegisterDeviceDto) {
    return this.devices.register(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.findOne(id);
  }

  /** Assign a room / toggle kiosk mode. Needs the settings PIN (or admin PIN). */
  @Patch(':id')
  @RequirePin('settings')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePin('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.remove(id);
  }
}
