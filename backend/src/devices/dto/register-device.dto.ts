import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class RegisterDeviceDto {
  /** Client-generated UUID persisted in the browser's localStorage. */
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  userAgent?: string;
}
