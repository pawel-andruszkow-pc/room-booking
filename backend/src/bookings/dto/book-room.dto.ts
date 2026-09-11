import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class BookRoomDto {
  /**
   * When the meeting starts. Omitted by the walk-in flow ("book this room
   * now"); set by a reservation made for later today.
   */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;
}
