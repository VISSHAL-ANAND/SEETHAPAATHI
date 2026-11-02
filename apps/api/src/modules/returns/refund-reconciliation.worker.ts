import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefundService } from './refund.service';

@Injectable()
export class RefundReconciliationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(RefundReconciliationWorker.name);
  private running = false;
  private stopped = false;

  constructor(private readonly refunds: RefundService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async reconcile() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.refunds.reconcilePending(20);
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      this.logger.error(`Refund reconciliation polling failed (${errorType})`);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
  }
}
