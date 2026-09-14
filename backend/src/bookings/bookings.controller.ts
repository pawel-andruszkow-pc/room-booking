import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RequirePin } from '../common/require-pin.decorator';
import { BookingsService } from './bookings.service';
import { RoomStreamService } from './room-stream.service';
import { BookRoomDto } from './dto/book-room.dto';
import { EventActionDto } from './dto/event-action.dto';

/**
 * Room-centric booking endpoints used by the tablet. Every mutation returns the
 * fresh RoomStatus so the UI can re-render without a second round-trip.
 */
@Controller('rooms/:roomId')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly stream: RoomStreamService,
  ) {}

  @Get('status')
  status(@Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.bookings.getStatus(roomId, { fromDevice: true });
  }

  /**
   * Live status: the current state, then a message whenever it changes. Lets a
   * calendar edit reach the screen in seconds without the tablet polling hard.
   */
  @Sse('stream')
  streamStatus(
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ): Observable<{ data: string }> {
    return this.stream
      .subscribe(roomId)
      .pipe(map((status) => ({ data: JSON.stringify(status) })));
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

  /** "I'm already here" — presence for a meeting that is about to start. */
  @Post('check-in-early')
  @HttpCode(200)
  checkInEarly(@Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: EventActionDto) {
    return this.bookings.confirmUpcoming(roomId, dto.eventId);
  }

  /** Takes that back: the meeting goes back to being asked about when it starts. */
  @Post('check-in-early/cancel')
  @HttpCode(200)
  cancelCheckInEarly(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: EventActionDto,
  ) {
    return this.bookings.cancelUpcoming(roomId, dto.eventId);
  }

  @Post('release')
  @HttpCode(200)
  release(@Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: EventActionDto) {
    return this.bookings.release(roomId, dto.eventId);
  }

  /**
   * Removes one of today's meetings from the calendar, running or not. Behind
   * the settings PIN, unlike the room screen's "Free up the room".
   */
  @Delete('events/:eventId')
  @RequirePin('settings')
  removeEvent(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.bookings.removeEvent(roomId, eventId);
  }
}
