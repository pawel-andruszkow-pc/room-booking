import { IsString, Length } from 'class-validator';

export class TestCalendarDto {
  @IsString()
  @Length(1, 300)
  calendarId: string;
}
