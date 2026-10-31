import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  // Trust reverse proxy (Next.js rewrite proxy & Render edge)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Direct fast-path handler for external monitoring probes (cron-job.org, UptimeRobot, Render health check)
  expressApp.get(['/health', '/api/health'], (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Cookie Parser for HttpOnly auth tokens
  app.use(cookieParser());

  // CORS Configuration
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        origin.endsWith('.onrender.com') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      'X-Cart-Id',
    ],
  });

  // API Versioning Prefix (excluding root, /health, /api/health for probes & external pingers)
  app.setGlobalPrefix('api/v1', {
    exclude: ['/', 'health', 'api/health'],
  });

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`🚀 Seethapaati API running on http://localhost:${port}/api/v1`);
}

bootstrap();
