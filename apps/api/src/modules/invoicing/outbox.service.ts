import { Injectable, Logger } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface ClaimedOutboxEvent {
  id: string;
  idempotencyKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  retryCount: number;
  maxRetries: number;
  leasedBy: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly leaseMs = 2 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      idempotencyKey?: string;
      maxRetries?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const idempotencyKey = input.idempotencyKey ?? `${input.eventType}:${input.aggregateType}:${input.aggregateId}`;
    try {
      return await client.outboxEvent.create({
        data: {
          idempotencyKey,
          eventType: input.eventType,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          payload: input.payload as Prisma.InputJsonValue,
          maxRetries: input.maxRetries ?? 5,
          status: OutboxStatus.PENDING,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await client.outboxEvent.findUnique({ where: { idempotencyKey } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async enqueueInvoiceGeneration(orderId: string, tx?: Prisma.TransactionClient) {
    return this.enqueue({
      eventType: 'INVOICE_GENERATE',
      aggregateType: 'ORDER',
      aggregateId: orderId,
      idempotencyKey: `INVOICE_GENERATE:ORDER:${orderId}`,
      payload: { orderId },
    }, tx);
  }

  async claimBatch(limit = 10, eventTypes?: string[]): Promise<ClaimedOutboxEvent[]> {
    const leaseUntil = new Date(Date.now() + this.leaseMs);
    const leasedBy = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string; idempotency_key: string; event_type: string; aggregate_type: string;
        aggregate_id: string; payload: unknown; retry_count: number; max_retries: number;
      }>>`
        SELECT id, idempotency_key, event_type, aggregate_type, aggregate_id,
               payload, retry_count, max_retries
        FROM outbox_events
        WHERE
          ${eventTypes?.length ? Prisma.sql`event_type IN (${Prisma.join(eventTypes)})` : Prisma.sql`TRUE`}
          AND ((status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
          OR (status = 'PROCESSING' AND leased_until < NOW()))
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows.length) return [];
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: OutboxStatus.PROCESSING, leasedUntil: leaseUntil, leasedBy },
      });
      return rows.map((r) => ({
        id: r.id,
        idempotencyKey: r.idempotency_key,
        eventType: r.event_type,
        aggregateType: r.aggregate_type,
        aggregateId: r.aggregate_id,
        payload: r.payload,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        leasedBy,
      }));
    });
  }

  async complete(id: string, leasedBy: string) {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: OutboxStatus.PROCESSING, leasedBy },
      data: { status: OutboxStatus.COMPLETED, completedAt: new Date(), leasedUntil: null, leasedBy: null },
    });
    return result.count === 1;
  }

  async fail(id: string, error: unknown, leasedBy: string) {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    const safeError = `${errorType}: event processing failed`;
    const current = await this.prisma.outboxEvent.findFirst({ where: { id, status: OutboxStatus.PROCESSING, leasedBy } });
    if (!current) return false;
    const retryCount = current.retryCount + 1;
    const terminal = retryCount >= current.maxRetries;
    const backoffSeconds = Math.min(300, Math.max(5, 2 ** Math.min(retryCount, 8)));
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id, status: OutboxStatus.PROCESSING, leasedBy },
      data: {
        status: terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        retryCount,
        nextRetryAt: terminal ? null : new Date(Date.now() + backoffSeconds * 1000),
        leasedUntil: null,
        leasedBy: null,
        lastError: safeError,
      },
    });
    if (updated.count !== 1) return false;
    this.logger.error(`Outbox event ${id} failed (attempt ${retryCount}, ${errorType})`);
    return true;
  }
}
