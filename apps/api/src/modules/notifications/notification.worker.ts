import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from '../invoicing/outbox.service';
import { NotificationService } from './notification.service';

// Keep sequential work comfortably inside the two-minute outbox lease.
// Email requests are individually bounded by EmailProvider.
const NOTIFICATION_BATCH_SIZE = 5;

@Injectable()
export class NotificationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private running = false;
  private stopped = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const events = await this.outbox.claimBatch(NOTIFICATION_BATCH_SIZE, [
        'NOTIFY_ORDER_STATUS',
        'NOTIFY_SHIPMENT_STATUS',
        'NOTIFY_RETURN_STATUS',
        'NOTIFY_REFUND_STATUS',
      ]);

      for (const event of events) {
        try {
          await this.notifications.processEvent(event);
          await this.outbox.complete(event.id, event.leasedBy);
        } catch (error) {
          await this.outbox.fail(event.id, error, event.leasedBy);
        }
      }
    } catch (error) {
      this.logger.error(
        `Notification polling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
  }
}
