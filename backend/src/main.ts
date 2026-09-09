import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { appConfig } from './config/app-config';

async function bootstrap() {
  // Validates the whole environment and fails fast with a list of every
  // problem, before we attempt to connect to the database or bind to a port.
  const config = appConfig();

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Admin-Pin',
      'X-Settings-Pin',
      'X-Device-Id',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  new Logger('Bootstrap').log(
    `Room booking API listening on port ${config.port} ` +
      `(calendar: ${config.calendar.provider}, poll: ${config.pollIntervalSeconds}s)`,
  );
}

bootstrap();
