import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export enum QueueName {
  NOTIFICATIONS = 'notifications',
  INVENTORY_TTL = 'inventory-ttl',
  WEBHOOK_RETRIES = 'webhook-retries',
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queues = new Map<QueueName, Queue>();
  private readonly isProduction: boolean;

  constructor(private configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    this.isProduction = nodeEnv === 'production' || nodeEnv === 'staging';
  }

  onModuleInit() {
    const rawRedisUrl = this.configService.get<string>('REDIS_URL') || process.env.REDIS_URL;
    const redisUrl = rawRedisUrl && rawRedisUrl.trim() !== '' ? rawRedisUrl.trim() : undefined;

    let host = this.configService.get<string>('REDIS_HOST') || process.env.REDIS_HOST;
    let port = this.configService.get<number>('REDIS_PORT') || (process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined);
    let password = this.configService.get<string>('REDIS_PASSWORD') || process.env.REDIS_PASSWORD;
    let isTls = false;

    if (redisUrl) {
      try {
        const parsed = new URL(redisUrl);
        host = parsed.hostname;
        port = parsed.port ? parseInt(parsed.port, 10) : 6379;
        if (parsed.password) {
          password = decodeURIComponent(parsed.password);
        }
        isTls = parsed.protocol === 'rediss:';
      } catch {
        isTls = redisUrl.startsWith('rediss://');
      }
    } else {
      host = host || 'localhost';
      port = port || 6379;
    }

    const connection: any = redisUrl
      ? {
          url: redisUrl,
          maxRetriesPerRequest: null,
          ...(isTls || redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
        }
      : {
          host,
          port,
          password: password || undefined,
          maxRetriesPerRequest: null,
        };

    // Instantiate core queues
    for (const name of Object.values(QueueName)) {
      try {
        const queue = new Queue(name, { connection });
        this.queues.set(name, queue);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (this.isProduction) {
          this.logger.error(`❌ FATAL: Could not initialize BullMQ queue ${name} in production: ${msg}`);
          throw new Error(`[QueueService] Failed to initialize BullMQ queue ${name} in production: ${msg}`);
        }
        this.logger.warn(`Could not initialize BullMQ queue ${name}: ${msg}`);
      }
    }

    this.logger.log('✅ BullMQ queue foundation initialized.');
  }

  async addJob<T>(queueName: QueueName, jobName: string, data: T, opts?: Record<string, unknown>) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      if (this.isProduction) {
        throw new Error(`[QueueService] BullMQ queue "${queueName}" is unavailable in production. Job "${jobName}" cannot be processed.`);
      }
      this.logger.warn(`Queue ${queueName} not available. Job ${jobName} skipped in dev mode.`);
      return null;
    }
    return await queue.add(jobName, data, opts);
  }

  async onModuleDestroy() {
    for (const [name, queue] of this.queues.entries()) {
      await queue.close().catch(() => {});
      this.logger.log(`Queue ${name} closed.`);
    }
  }
}
