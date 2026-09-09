import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePin } from '../common/require-pin.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Non-sensitive settings every tablet needs (poll interval, check-in rules). */
  @Get()
  getPublic() {
    return this.settings.getPublic();
  }

  @Patch()
  @RequirePin('admin')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
