import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private readonly isProduction: boolean;
  private readonly memoryFallback = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    this.isProduction = nodeEnv === 'production' || nodeEnv === 'staging';
  }

  async onModuleInit() {
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
      } catch (err) {
        this.logger.warn(`Could not parse REDIS_URL via URL parser: ${(err as Error).message}`);
        isTls = redisUrl.startsWith('rediss://');
      }
    } else {
      host = host || 'localhost';
      port = port || 6379;
    }

    const scheme = isTls || (redisUrl && redisUrl.startsWith('rediss://')) ? 'rediss' : 'redis';
    const targetDisplay = `${scheme}://${host}:${port}`;

    try {
      const redisOptions: RedisOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(`⚠️ Redis unreachable at ${targetDisplay}. Operating in memory fallback mode.`);
            return null; // Stop reconnecting after 3 tries, use memory fallback
          }
          return Math.min(times * 200, 2000);
        },
      };

      if (isTls || (redisUrl && redisUrl.startsWith('rediss://'))) {
        redisOptions.tls = {
          rejectUnauthorized: false,
        };
      }

      this.client = redisUrl
        ? new Redis(redisUrl, redisOptions)
        : new Redis({
            host,
            port,
            password: password || undefined,
            ...redisOptions,
          });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`✅ Redis connected at ${targetDisplay}`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection warning at ${targetDisplay}: ${err.message}. Using in-memory fallback.`);
      });

      this.logger.log(`Connecting to Redis at ${targetDisplay}...`);
      await this.client.connect().catch((err) => {
        this.isConnected = false;
        this.logger.warn(
          `⚠️ Redis connection failed at ${targetDisplay} (${err.message}). Gracefully using in-memory fallback. Server startup will continue normally.`,
        );
      });

      if (this.isConnected) {
        this.logger.log(`✅ Redis connection verified at ${targetDisplay}.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.isConnected = false;
      this.logger.warn(
        `⚠️ Redis initialization exception at ${targetDisplay}: ${msg}. Gracefully operating with in-memory fallback.`,
      );
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (err) {
        this.logger.warn(`Redis get failed (${(err as Error).message}), falling back to memory.`);
      }
    }

    const item = this.memoryFallback.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.memoryFallback.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (err) {
        this.logger.warn(`Redis set failed (${(err as Error).message}), falling back to memory.`);
      }
    }

    this.memoryFallback.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        const value = await this.client.incr(key);
        if (value === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
        return value;
      } catch (err) {
        this.logger.warn(`Redis incr failed (${(err as Error).message}), falling back to memory.`);
      }
    }

    const item = this.memoryFallback.get(key);
    const next = item && (!item.expiresAt || item.expiresAt >= Date.now()) ? Number(item.value) + 1 : 1;
    this.memoryFallback.set(key, { value: String(next), expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : item?.expiresAt });
    return next;
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis del failed (${(err as Error).message}), falling back to memory.`);
      }
    }

    this.memoryFallback.delete(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Failed to parse cached JSON for key '${key}': ${(err as Error).message}`);
      return null;
    }
  }

  async setJson<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      await this.set(key, serialized, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Failed to serialize JSON for key '${key}': ${(err as Error).message}`);
    }
  }

  async delByPattern(pattern: string): Promise<number> {
    let deletedCount = 0;
    if (this.isConnected && this.client) {
      try {
        const stream = this.client.scanStream({
          match: pattern,
          count: 100,
        });

        const keysToDelete: string[] = [];
        for await (const resultKeys of stream) {
          if (resultKeys && resultKeys.length) {
            keysToDelete.push(...resultKeys);
          }
        }

        if (keysToDelete.length > 0) {
          for (let i = 0; i < keysToDelete.length; i += 500) {
            const batch = keysToDelete.slice(i, i + 500);
            deletedCount += await this.client.del(...batch);
          }
        }
        return deletedCount;
      } catch (err) {
        this.logger.warn(`Redis delByPattern failed (${(err as Error).message}), falling back to memory.`);
      }
    }

    const regex = new RegExp('^' + pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const key of Array.from(this.memoryFallback.keys())) {
      if (regex.test(key)) {
        this.memoryFallback.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  isMemoryFallbackActive(): boolean {
    return !this.isConnected;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.logger.log('Redis client disconnected.');
    }
  }
}
