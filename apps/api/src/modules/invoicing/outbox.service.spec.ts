import { OutboxStatus } from '@prisma/client';
import { OutboxService } from './outbox.service';

describe('OutboxService lease ownership and retries', () => {
  let prisma: any;
  let service: OutboxService;
  const current = {
    id: 'event-1',
    status: OutboxStatus.PROCESSING,
    leasedBy: 'worker-1',
    retryCount: 1,
    maxRetries: 5,
  };

  beforeEach(() => {
    prisma = {
      outboxEvent: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new OutboxService(prisma);
  });

  it('releases a failed event with bounded exponential backoff and a safe error label', async () => {
    const sensitiveError = new Error('provider request failed for customer@example.com');
    await expect(service.fail('event-1', sensitiveError, 'worker-1')).resolves.toBe(true);

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', status: OutboxStatus.PROCESSING, leasedBy: 'worker-1' },
      data: expect.objectContaining({
        status: OutboxStatus.PENDING,
        retryCount: 2,
        leasedUntil: null,
        leasedBy: null,
        lastError: 'Error: event processing failed',
      }),
    });
    const persisted = prisma.outboxEvent.updateMany.mock.calls[0][0].data.lastError;
    expect(persisted).not.toContain('customer@example.com');
    expect(persisted).not.toContain('provider request failed');
  });

  it('marks the event terminal after max retries without scheduling another attempt', async () => {
    prisma.outboxEvent.findFirst.mockResolvedValue({
      ...current,
      retryCount: 4,
      maxRetries: 5,
    });

    await expect(service.fail('event-1', new Error('failure'), 'worker-1')).resolves.toBe(true);

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', status: OutboxStatus.PROCESSING, leasedBy: 'worker-1' },
      data: expect.objectContaining({
        status: OutboxStatus.FAILED,
        retryCount: 5,
        nextRetryAt: null,
        leasedUntil: null,
        leasedBy: null,
      }),
    });
  });

  it('does not mutate an event after the worker lease is no longer owned', async () => {
    prisma.outboxEvent.findFirst.mockResolvedValue(null);

    await expect(service.fail('event-1', new Error('stale lease'), 'worker-1')).resolves.toBe(false);

    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('completes an event only for the current processing lease owner', async () => {
    await expect(service.complete('event-1', 'worker-1')).resolves.toBe(true);

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', status: OutboxStatus.PROCESSING, leasedBy: 'worker-1' },
      data: expect.objectContaining({
        status: OutboxStatus.COMPLETED,
        leasedUntil: null,
        leasedBy: null,
      }),
    });
  });
});
