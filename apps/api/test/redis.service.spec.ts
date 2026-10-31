import { ConfigService } from '@nestjs/config';
import { RedisService } from '../src/modules/redis/redis.service';

describe('RedisService - Production Safety & Fallback Controls', () => {
  describe('Development Mode (NODE_ENV=development)', () => {
    let devRedisService: RedisService;
    let mockConfigService: any;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn((key: string, defaultVal?: any) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          return defaultVal;
        }),
      };

      devRedisService = new RedisService(mockConfigService as ConfigService);
    });

    it('should allow memory fallback in development mode', async () => {
      expect(devRedisService.isMemoryFallbackActive()).toBe(true);

      // Verify set, get, del operate in memory
      await devRedisService.set('test:key', 'hello_world', 10);
      const val = await devRedisService.get('test:key');
      expect(val).toBe('hello_world');

      await devRedisService.del('test:key');
      const deletedVal = await devRedisService.get('test:key');
      expect(deletedVal).toBeNull();
    });

    it('should expire keys in memory fallback after TTL', async () => {
      await devRedisService.set('temp:key', 'short_lived', -1); // already expired
      const val = await devRedisService.get('temp:key');
      expect(val).toBeNull();
    });
  });

  describe('Production Mode (NODE_ENV=production)', () => {
    let prodRedisService: RedisService;
    let mockConfigService: any;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn((key: string, defaultVal?: any) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'REDIS_HOST') return 'prod-redis.internal';
          if (key === 'REDIS_PORT') return 6379;
          return defaultVal;
        }),
      };

      prodRedisService = new RedisService(mockConfigService as ConfigService);
    });

    it('should allow memory fallback gracefully in production without throwing fatal exceptions', async () => {
      expect(prodRedisService.isMemoryFallbackActive()).toBe(true);

      // Verify set, get, del operate gracefully in memory fallback
      await prodRedisService.set('prod:key', 'prod_value', 10);
      const val = await prodRedisService.get('prod:key');
      expect(val).toBe('prod_value');

      await prodRedisService.del('prod:key');
      const deletedVal = await prodRedisService.get('prod:key');
      expect(deletedVal).toBeNull();
    });
  });

  describe('Cloud Redis (REDIS_URL handling)', () => {
    it('should initialize Redis client targeting the parsed REDIS_URL host and port', async () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultVal?: any) => {
          if (key === 'NODE_ENV') return 'development';
          if (key === 'REDIS_URL') return 'rediss://default:upstash_token@cloud-redis.upstash.io:6380';
          return defaultVal;
        }),
      };

      const redisService = new RedisService(mockConfigService as unknown as ConfigService);
      await redisService.onModuleInit();

      const client = redisService.getClient();
      expect(client).toBeDefined();
      expect(client?.options.host).toBe('cloud-redis.upstash.io');
      expect(client?.options.port).toBe(6380);
      expect(client?.options.tls).toBeDefined();

      await redisService.onModuleDestroy();
    });
  });
});
