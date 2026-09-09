import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePin } from '../common/require-pin.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** Active rooms (pass `?all=true` from the admin page to include inactive ones). */
  @Get()
  findAll(@Query('all', new ParseBoolPipe({ optional: true })) all?: boolean) {
    return this.rooms.findAll(all === true);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.findOne(id);
  }

  @Post()
  @RequirePin('admin')
  create(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Patch(':id')
  @RequirePin('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePin('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(id);
  }
}
