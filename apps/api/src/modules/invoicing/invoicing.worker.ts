import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { OutboxService } from './outbox.service';
import { InvoiceService } from './invoice.service';

@Injectable()
export class InvoicingWorker implements OnModuleDestroy {
  private readonly logger = new Logger(InvoicingWorker.name);
  private running = false;
  private stopped = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly invoices: InvoiceService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const events = await this.outbox.claimBatch(10, ['INVOICE_GENERATE']);
      const workerId = randomUUID();
      for (const event of events) {
        try {
          if (event.eventType === 'INVOICE_GENERATE') {
            const payload = event.payload as { orderId?: string };
            const orderId = payload.orderId ?? event.aggregateId;
            await this.invoices.generateInvoice(orderId);
          }
          await this.outbox.complete(event.id, event.leasedBy);
        } catch (error) {
          await this.outbox.fail(event.id, error, event.leasedBy);
        }
      }
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      this.logger.error(`Invoice outbox polling failed (${errorType})`);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
  }
}
