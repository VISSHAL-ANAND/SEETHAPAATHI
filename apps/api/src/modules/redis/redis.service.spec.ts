import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const client = new EventEmitter() as any;
    client.connect = jest.fn().mockImplementation(async () => {
      client.emit('connect');
    });
    client.quit = jest.fn().mockResolvedValue('OK');
    client.eval = jest.fn().mockResolvedValue(7);
    return client;
  }),
}));

function configFor(nodeEnv = 'test') {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'NODE_ENV') return nodeEnv;
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return fallback;
    }),
  } as unknown as ConfigService;
}

describe('RedisService readiness and atomic rate-limit counters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not report readiness on TCP connect before Redis is ready', async () => {
    const service = new RedisService(configFor());
    await service.onModuleInit();

    const client = (Redis as unknown as jest.Mock).mock.results[0].value;
    expect(service.isReady()).toBe(false);

    client.emit('ready');
    expect(service.isReady()).toBe(true);

    client.emit('close');
    expect(service.isReady()).toBe(false);

    await service.onModuleDestroy();
  });

  it('uses one atomic Redis script for increment and TTL creation', async () => {
    const service = new RedisService(configFor());
    const evalMock = jest.fn().mockResolvedValue(7);
    (service as any).client = { eval: evalMock };
    (service as any).isConnected = true;

    await expect(service.incr('ratelimit:auth:login:127.0.0.1', 60)).resolves.toBe(7);

    expect(evalMock).toHaveBeenCalledWith(expect.stringContaining("redis.call('EXPIRE'"), 1, 'ratelimit:auth:login:127.0.0.1', 60);
  });

  it('uses an atomic counter without setting a TTL when no TTL is requested', async () => {
    const service = new RedisService(configFor());
    const evalMock = jest.fn().mockResolvedValue(3);
    (service as any).client = { eval: evalMock };
    (service as any).isConnected = true;

    await expect(service.incr('counter')).resolves.toBe(3);

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), 1, 'counter', 0);
  });
});
