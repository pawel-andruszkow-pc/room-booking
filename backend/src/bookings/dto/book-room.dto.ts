import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class BookRoomDto {
  @IsInt()
  @Min(5)
  @Max(720)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;
}
