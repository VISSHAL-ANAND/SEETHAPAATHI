jest.doMock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_30_SECONDS: '*/30 * * * * *' },
}));

const { RefundReconciliationWorker } = require('./refund-reconciliation.worker') as typeof import('./refund-reconciliation.worker');

describe('RefundReconciliationWorker', () => {
  let refunds: { reconcilePending: jest.Mock };
  let worker: InstanceType<typeof RefundReconciliationWorker>;

  beforeEach(() => {
    refunds = { reconcilePending: jest.fn().mockResolvedValue(undefined) };
    worker = new RefundReconciliationWorker(refunds as any);
  });

  it('runs one bounded reconciliation batch', async () => {
    await worker.reconcile();

    expect(refunds.reconcilePending).toHaveBeenCalledTimes(1);
    expect(refunds.reconcilePending).toHaveBeenCalledWith(20);
  });

  it('does not overlap concurrent cron invocations', async () => {
    let finish!: () => void;
    refunds.reconcilePending.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));

    const first = worker.reconcile();
    const second = worker.reconcile();

    expect(refunds.reconcilePending).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
  });

  it('keeps the worker process alive when a reconciliation batch fails', async () => {
    refunds.reconcilePending.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(worker.reconcile()).resolves.toBeUndefined();
    refunds.reconcilePending.mockResolvedValueOnce(undefined);
    await worker.reconcile();

    expect(refunds.reconcilePending).toHaveBeenCalledTimes(2);
  });

  it('does not run after shutdown', async () => {
    worker.onModuleDestroy();
    await worker.reconcile();

    expect(refunds.reconcilePending).not.toHaveBeenCalled();
  });
});
