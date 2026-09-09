import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './env.validation';

async function bootstrap() {
  // Fail fast with a clear message if any required env var is missing, before
  // we attempt to connect to the database or bind to a port.
  validateEnv();

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN!.split(',').map((origin) => origin.trim()),
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

  const port = Number(process.env.PORT) || 3020;
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`Room booking API listening on port ${port}`);
}

bootstrap();
