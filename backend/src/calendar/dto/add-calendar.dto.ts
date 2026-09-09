import { IsString, Length } from 'class-validator';

export class AddCalendarDto {
  /** Google calendar id, e.g. c_188...@resource.calendar.google.com. */
  @IsString()
  @Length(1, 300)
  calendarId: string;
}
