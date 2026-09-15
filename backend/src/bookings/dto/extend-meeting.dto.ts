import { IsInt, IsString, Length, Max, Min } from 'class-validator';

/** Body for "Extend reservation": how much longer the running meeting should run. */
export class ExtendMeetingDto {
  @IsString()
  @Length(1, 300)
  eventId: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  minutes: number;
}
