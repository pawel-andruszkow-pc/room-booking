import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookRoomDto } from './dto/book-room.dto';
import { EventActionDto } from './dto/event-action.dto';

/**
 * Room-centric booking endpoints used by the tablet. Every mutation returns the
 * fresh RoomStatus so the UI can re-render without a second round-trip.
 */
@Controller('rooms/:roomId')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('status')
  status(@Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.bookings.getStatus(roomId, { fromDevice: true });
  }

  /** Whole-day agenda (past meetings included) for the tablet's "Today" page. */
  @Get('today')
  today(@Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.bookings.getDay(roomId);
  }

  @Post('book')
  @HttpCode(200)
  book(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: BookRoomDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.bookings.book(roomId, dto, deviceId);
  }

  @Post('end')
  @HttpCode(200)
  end(@Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: EventActionDto) {
    return this.bookings.endMeeting(roomId, dto.eventId);
  }

  @Post('check-in')
  @HttpCode(200)
  checkIn(@Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: EventActionDto) {
    return this.bookings.confirmPresence(roomId, dto.eventId);
  }

  @Post('release')
  @HttpCode(200)
  release(@Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: EventActionDto) {
    return this.bookings.release(roomId, dto.eventId);
  }
}
