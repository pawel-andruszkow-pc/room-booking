import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @Length(1, 120)
  name: string;

  /** Google Calendar id, e.g. `abc123@group.calendar.google.com`. */
  @IsString()
  @Length(1, 300)
  calendarId: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
