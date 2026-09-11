import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'settingsPin must be exactly 4 digits' })
  settingsPin?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'adminPin must be exactly 4 digits' })
  adminPin?: string;

  @IsOptional()
  @IsBoolean()
  checkInEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  checkInMinutes?: number;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  pollIntervalSeconds?: number;

  /** Null clears the limit. */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  maxBookingMinutes?: number | null;
}
