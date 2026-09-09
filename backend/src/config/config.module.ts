import { Global, Module } from '@nestjs/common';
import { AppConfig, appConfig } from './app-config';

/** Injection token for the validated {@link AppConfig}. */
export const APP_CONFIG = 'APP_CONFIG';

/**
 * Makes the configuration injectable everywhere without each module importing
 * it:  `constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}`.
 * Code outside the Nest container (main.ts, the seed and TypeORM CLIs) calls
 * `appConfig()` directly — both return the same frozen object.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => appConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
