// main.ts
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config(); // 👈 THIS LINE loads your .env file

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse cookies
  app.use(cookieParser());

  // Increase request size limit to handle large CSV uploads (default is ~100kb)
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Enable CORS to allow frontend (localhost:3000) to access backend with cookies
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  console.log('Using DB:', process.env.DATABASE_URL);
  // Start the server
  await app.listen(4000);
  console.log('[NestJS] Server is running on http://localhost:4000');
}
bootstrap();
