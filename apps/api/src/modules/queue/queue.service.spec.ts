import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QueueName, QueueService } from './queue.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

function configFor(nodeEnv: string) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'NODE_ENV') return nodeEnv;
      if (key === 'REDIS_URL') return 'rediss://default:secret@redis.example.test:6380';
      return fallback;
    }),
  } as unknown as ConfigService;
}

describe('QueueService Redis TLS configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not disable TLS certificate verification for rediss URLs', () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'REDIS_URL') return 'rediss://default:secret@redis.example.test:6380';
        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new QueueService(config);
    service.onModuleInit();

    const options = (Queue as unknown as jest.Mock).mock.calls[0][1];
    expect(options.connection.tls).toEqual({});
    expect(options.connection.tls.rejectUnauthorized).not.toBe(false);

    void service.onModuleDestroy();
  });

  it('does not add TLS options for a plain redis URL', () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        return fallback;
      }),
    } as unknown as ConfigService;

    const service = new QueueService(config);
    service.onModuleInit();

    const options = (Queue as unknown as jest.Mock).mock.calls[0][1];
    expect(options.connection.tls).toBeUndefined();

    void service.onModuleDestroy();
  });

  it('fails explicitly when a production queue is unavailable', async () => {
    const service = new QueueService(configFor('production'));

    await expect(
      service.addJob(QueueName.NOTIFICATIONS, 'send-order-update', { orderId: 'order-1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('keeps the null fallback only in development when a queue is unavailable', async () => {
    const service = new QueueService(configFor('development'));

    await expect(
      service.addJob(QueueName.NOTIFICATIONS, 'send-order-update', { orderId: 'order-1' }),
    ).resolves.toBeNull();
  });

  it('propagates asynchronous Redis enqueue failures', async () => {
    const service = new QueueService(configFor('production'));
    service.onModuleInit();

    const failure = new Error('Redis connection unavailable');
    const queue = (service as any).queues.get(QueueName.NOTIFICATIONS);
    queue.add.mockRejectedValue(failure);

    await expect(
      service.addJob(QueueName.NOTIFICATIONS, 'send-order-update', { orderId: 'order-1' }),
    ).rejects.toBe(failure);

    await service.onModuleDestroy();
  });
});
