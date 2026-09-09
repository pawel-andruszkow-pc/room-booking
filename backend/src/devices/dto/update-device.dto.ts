import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  /** Room this device displays; `null` un-assigns it. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsBoolean()
  isKiosk?: boolean;
}
