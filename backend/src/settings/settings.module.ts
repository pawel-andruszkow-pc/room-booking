import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from './app-settings.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Global so guards and every feature module can read settings without re-importing. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSettings])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
