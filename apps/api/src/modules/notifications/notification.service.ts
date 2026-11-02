import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../invoicing/outbox.service';
import { EmailProvider } from './email.provider';

const EVENT = { ORDER: 'NOTIFY_ORDER_STATUS', SHIPMENT: 'NOTIFY_SHIPMENT_STATUS', RETURN: 'NOTIFY_RETURN_STATUS', REFUND: 'NOTIFY_REFUND_STATUS' } as const;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService, private readonly email: EmailProvider) {}

  enqueueOrderStatus(orderId: string, status: string, tx?: Prisma.TransactionClient) { return this.enqueue(EVENT.ORDER, 'ORDER', orderId, { orderId, status }, tx); }
  enqueueShipmentStatus(orderId: string, shipmentId: string, status: string, tx?: Prisma.TransactionClient) { return this.enqueue(EVENT.SHIPMENT, 'ORDER', orderId, { orderId, shipmentId, status }, tx); }
  enqueueReturnStatus(returnId: string, orderId: string, status: string, tx?: Prisma.TransactionClient) { return this.enqueue(EVENT.RETURN, 'RETURN', returnId, { returnId, orderId, status }, tx); }
  enqueueRefundStatus(refundId: string, orderId: string, status: string, tx?: Prisma.TransactionClient) { return this.enqueue(EVENT.REFUND, 'REFUND', refundId, { refundId, orderId, status }, tx); }

  private enqueue(eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, tx?: Prisma.TransactionClient) {
    return this.outbox.enqueue({ eventType, aggregateType, aggregateId, payload, idempotencyKey: `${eventType}:${aggregateType}:${aggregateId}:${String(payload.status)}` }, tx);
  }

  async processEvent(event: { id: string; eventType: string; aggregateId: string; payload: unknown }) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const data = await this.resolveRecipient(event.eventType, payload, event.aggregateId);
    if (!data) return;
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId: data.userId } });
    if (preference && !this.isEnabled(event.eventType, preference)) {
      await this.prisma.notification.upsert({ where: { outboxEventId: event.id }, create: { userId: data.userId, orderId: data.orderId, outboxEventId: event.id, eventType: event.eventType, recipient: data.email, subject: data.subject, status: NotificationStatus.SENT, sentAt: new Date() }, update: { status: NotificationStatus.SENT, sentAt: new Date() } });
      return;
    }
    const existing = await this.prisma.notification.upsert({ where: { outboxEventId: event.id }, create: { userId: data.userId, orderId: data.orderId, outboxEventId: event.id, eventType: event.eventType, recipient: data.email, subject: data.subject, status: NotificationStatus.PENDING }, update: {} });
    if (existing.status === NotificationStatus.SENT) return;
    const attempt = await this.prisma.notification.update({ where: { id: existing.id }, data: { attemptCount: { increment: 1 }, status: NotificationStatus.PENDING, lastError: null } });
    try {
      const providerId = await this.email.send({ to: data.email, subject: data.subject, html: data.html, idempotencyKey: `notification:${event.id}` });
      await this.prisma.notification.update({ where: { id: attempt.id }, data: { status: NotificationStatus.SENT, providerMessageId: providerId, sentAt: new Date(), lastError: null } });
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      await this.prisma.notification.update({
        where: { id: attempt.id },
        data: { status: NotificationStatus.FAILED, lastError: `${errorType}: delivery failed` },
      });
      throw error;
    }
  }

  listForUser(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, orderId: true, eventType: true, recipient: true, subject: true, status: true, providerMessageId: true, attemptCount: true, lastError: true, sentAt: true, createdAt: true } }); }
  getPreferences(userId: string) { return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} }); }
  updatePreferences(userId: string, input: Partial<{orderUpdates:boolean;shipmentUpdates:boolean;returnUpdates:boolean;refundUpdates:boolean}>) { return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...input }, update: input }); }

  private isEnabled(eventType: string, p: {orderUpdates:boolean;shipmentUpdates:boolean;returnUpdates:boolean;refundUpdates:boolean}) { if (eventType === EVENT.ORDER) return p.orderUpdates; if (eventType === EVENT.SHIPMENT) return p.shipmentUpdates; if (eventType === EVENT.RETURN) return p.returnUpdates; if (eventType === EVENT.REFUND) return p.refundUpdates; return true; }

  private async resolveRecipient(eventType: string, payload: Record<string, unknown>, aggregateId: string) {
    let userId: string | null = null; let orderId: string | null = typeof payload.orderId === 'string' ? payload.orderId : null; const status = typeof payload.status === 'string' ? payload.status : 'UPDATED';
    if (eventType === EVENT.RETURN) { const ret = await this.prisma.return.findUnique({ where: { id: aggregateId }, select: { userId: true, orderId: true } }); if (!ret) throw new NotFoundException({ error: 'RETURN_NOT_FOUND' }); userId = ret.userId; orderId = ret.orderId; }
    else if (eventType === EVENT.REFUND) { const refund = await this.prisma.refund.findUnique({ where: { id: aggregateId }, select: { orderId: true, order: { select: { userId: true } } } }); if (!refund || !refund.order.userId) return null; userId = refund.order.userId; orderId = refund.orderId; }
    else { if (!orderId) return null; const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } }); if (!order?.userId) return null; userId = order.userId; }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } }); if (!user) return null;
    const labels: Record<string,string> = { PAID:'Payment confirmed', PAYMENT_FAILED:'Payment failed', PROCESSING:'Order is being processed', PACKED:'Order packed', SHIPPED:'Order shipped', OUT_FOR_DELIVERY:'Out for delivery', DELIVERED:'Order delivered', RETURN_REQUESTED:'Return requested', REQUESTED:'Return requested', APPROVED:'Return approved', PICKED_UP:'Return picked up', RECEIVED:'Return received', INSPECTED:'Return inspected', REFUND_ELIGIBLE:'Return approved for refund', COMPLETED:'Return completed', REJECTED:'Return rejected', CANCELLED:'Update cancelled', PENDING:'Refund initiated', PROCESSED:'Refund processed', FAILED:'Refund failed' };
    const label = labels[status] ?? 'Account update'; const subject = `Seethapaati — ${label}`; const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${escapeHtml(label)}</h2><p>Hello ${escapeHtml(user.fullName)},</p><p>There is an update to your Seethapaati order.</p><p><strong>Status:</strong> ${escapeHtml(status)}</p>${orderId ? `<p><strong>Order:</strong> ${escapeHtml(orderId)}</p>` : ''}<p>Sign in to your account for full details.</p></div>`;
    return { userId, orderId, email: user.email, subject, html };
  }
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char)); }