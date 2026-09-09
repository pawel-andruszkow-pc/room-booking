import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

/** Admin helper for the local provider: add a test meeting to a calendar. */
export class CreateLocalEventDto {
  @IsString()
  @Length(1, 300)
  calendarId: string;

  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsDateString()
  start: string;

  @IsDateString()
  end: string;
}
