import { IsString, Length } from 'class-validator';

/** Body for end / check-in / release actions: which event the tablet is acting on. */
export class EventActionDto {
  @IsString()
  @Length(1, 300)
  eventId: string;
}
