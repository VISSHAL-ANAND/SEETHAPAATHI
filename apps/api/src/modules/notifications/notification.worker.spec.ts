jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_10_SECONDS: '*/10 * * * * *' },
}));

import { NotificationWorker } from './notification.worker';

describe('NotificationWorker', () => {
  let outbox: { claimBatch: jest.Mock; complete: jest.Mock; fail: jest.Mock };
  let notifications: { processEvent: jest.Mock };
  let worker: NotificationWorker;

  beforeEach(() => {
    outbox = {
      claimBatch: jest.fn().mockResolvedValue([]),
      complete: jest.fn().mockResolvedValue(true),
      fail: jest.fn().mockResolvedValue(true),
    };
    notifications = { processEvent: jest.fn().mockResolvedValue(undefined) };
    worker = new NotificationWorker(outbox as any, notifications as any);
  });

  it('claims a bounded batch so sequential email sends stay within the outbox lease', async () => {
    await worker.processOutbox();

    expect(outbox.claimBatch).toHaveBeenCalledWith(5, [
      'NOTIFY_ORDER_STATUS',
      'NOTIFY_SHIPMENT_STATUS',
      'NOTIFY_RETURN_STATUS',
      'NOTIFY_REFUND_STATUS',
    ]);
  });

  it('completes events after successful processing', async () => {
    const event = { id: 'event-1', eventType: 'NOTIFY_ORDER_STATUS', aggregateId: 'order-1', payload: {}, leasedBy: 'lease-1' };
    outbox.claimBatch.mockResolvedValue([event]);

    await worker.processOutbox();

    expect(notifications.processEvent).toHaveBeenCalledWith(event);
    expect(outbox.complete).toHaveBeenCalledWith('event-1', 'lease-1');
    expect(outbox.fail).not.toHaveBeenCalled();
  });

  it('releases failed events to the outbox retry policy', async () => {
    const event = { id: 'event-2', eventType: 'NOTIFY_ORDER_STATUS', aggregateId: 'order-1', payload: {}, leasedBy: 'lease-2' };
    const failure = new Error('email provider unavailable');
    outbox.claimBatch.mockResolvedValue([event]);
    notifications.processEvent.mockRejectedValue(failure);

    await worker.processOutbox();

    expect(outbox.fail).toHaveBeenCalledWith('event-2', failure, 'lease-2');
    expect(outbox.complete).not.toHaveBeenCalled();
  });

  it('does not start another batch after shutdown', async () => {
    worker.onModuleDestroy();
    await worker.processOutbox();

    expect(outbox.claimBatch).not.toHaveBeenCalled();
  });
});
