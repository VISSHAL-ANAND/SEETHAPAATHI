jest.doMock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_10_SECONDS: '*/10 * * * * *' },
}));

const { InvoicingWorker } = require('./invoicing.worker') as typeof import('./invoicing.worker');

describe('InvoicingWorker', () => {
  let outbox: { claimBatch: jest.Mock; complete: jest.Mock; fail: jest.Mock };
  let invoices: { generateInvoice: jest.Mock };
  let worker: InstanceType<typeof InvoicingWorker>;

  beforeEach(() => {
    outbox = {
      claimBatch: jest.fn().mockResolvedValue([]),
      complete: jest.fn().mockResolvedValue(true),
      fail: jest.fn().mockResolvedValue(true),
    };
    invoices = { generateInvoice: jest.fn().mockResolvedValue({ id: 'invoice-1' }) };
    worker = new InvoicingWorker(outbox as any, invoices as any);
  });

  it('claims only invoice-generation events', async () => {
    await worker.processOutbox();

    expect(outbox.claimBatch).toHaveBeenCalledWith(10, ['INVOICE_GENERATE']);
  });

  it('generates and completes a claimed invoice event', async () => {
    const event = {
      id: 'event-1',
      eventType: 'INVOICE_GENERATE',
      aggregateId: 'order-1',
      payload: { orderId: 'order-1' },
      leasedBy: 'lease-1',
    };
    outbox.claimBatch.mockResolvedValue([event]);

    await worker.processOutbox();

    expect(invoices.generateInvoice).toHaveBeenCalledWith('order-1');
    expect(outbox.complete).toHaveBeenCalledWith('event-1', 'lease-1');
    expect(outbox.fail).not.toHaveBeenCalled();
  });

  it('fails a claimed event when invoice generation fails', async () => {
    const event = {
      id: 'event-2',
      eventType: 'INVOICE_GENERATE',
      aggregateId: 'order-2',
      payload: {},
      leasedBy: 'lease-2',
    };
    const failure = new Error('invoice generation failed');
    outbox.claimBatch.mockResolvedValue([event]);
    invoices.generateInvoice.mockRejectedValue(failure);

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
