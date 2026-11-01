import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, RefundReason, RefundStatus, ReturnStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayAdapter } from '../payments/razorpay.adapter';
import { NotificationService } from '../notifications/notification.service';

const REFUND_LEASE_MS = 2 * 60 * 1000;

@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayAdapter,
    private readonly notifications: NotificationService,
  ) {}

  async process(
    orderId: string,
    amountCents: number,
    reason: RefundReason,
    returnId: string | undefined,
    idempotencyKey: string,
  ) {
    let record = await this.prisma.refund.findUnique({ where: { idempotencyKey } });

    if (!record) {
      try {
        record = await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              payments: {
                where: { status: PaymentStatus.CAPTURED },
                orderBy: { createdAt: 'desc' },
              },
            },
          });
          if (!order) throw new NotFoundException({ error: 'ORDER_NOT_FOUND' });

          if (returnId) {
            const ret = await tx.return.findUnique({ where: { id: returnId } });
            if (!ret || ret.orderId !== orderId || ret.status !== ReturnStatus.REFUND_ELIGIBLE) {
              throw new BadRequestException({ error: 'RETURN_NOT_REFUND_ELIGIBLE' });
            }
          }

          const payment = order.payments[0];
          if (!payment?.gatewayPaymentId) {
            throw new BadRequestException({ error: 'PAYMENT_NOT_REFUNDABLE' });
          }

          // Serialize refund creation against the captured payment so concurrent
          // refund requests cannot collectively exceed the captured amount.
          const lockedPayments = await tx.$queryRaw<Array<{ amount_cents: number }>>`
            SELECT amount_cents FROM payments WHERE id = ${payment.id} FOR UPDATE
          `;
          const lockedPayment = lockedPayments[0];
          if (!lockedPayment) {
            throw new NotFoundException({ error: 'PAYMENT_NOT_REFUNDABLE' });
          }

          const refunded = await tx.refund.aggregate({
            where: {
              paymentId: payment.id,
              status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSED] },
            },
            _sum: { amountCents: true },
          });
          const alreadyCommitted = refunded._sum.amountCents ?? 0;
          if (amountCents <= 0 || amountCents > lockedPayment.amount_cents - alreadyCommitted) {
            throw new BadRequestException({ error: 'INVALID_REFUND_AMOUNT' });
          }

          return tx.refund.create({
            data: {
              orderId,
              paymentId: payment.id,
              returnId,
              amountCents,
              currency: payment.currency,
              reason,
              idempotencyKey,
              status: RefundStatus.PENDING,
            },
          });
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          record = await this.prisma.refund.findUnique({ where: { idempotencyKey } });
        } else {
          throw error;
        }
      }
    }

    if (!record) throw new BadRequestException({ error: 'REFUND_INITIALIZATION_FAILED' });
    if (record.status === RefundStatus.PROCESSED) return record;

    const token = randomUUID();
    const claimed = await this.prisma.refund.updateMany({
      where: {
        id: record.id,
        status: RefundStatus.PENDING,
        OR: [
          { processingLeaseUntil: null },
          { processingLeaseUntil: { lt: new Date() } },
        ],
      },
      data: {
        processingToken: token,
        processingLeaseUntil: new Date(Date.now() + REFUND_LEASE_MS),
      },
    });

    if (claimed.count !== 1) {
      return this.prisma.refund.findUniqueOrThrow({ where: { id: record.id } });
    }

    try {
      const payment = await this.prisma.payment.findUnique({ where: { id: record.paymentId } });
      if (!payment?.gatewayPaymentId) {
        throw new BadRequestException({ error: 'PAYMENT_NOT_REFUNDABLE' });
      }

      // Reconcile first. This is what makes a crash after gateway creation safe.
      const reconciled = await this.razorpay.findRefundByInternalId(payment.gatewayPaymentId, record.id);
      const gateway = reconciled ?? await this.razorpay.createRefund(
        payment.gatewayPaymentId,
        record.amountCents,
        record.id,
      );

      return await this.prisma.$transaction(async (tx) => {
        // Serialize refund completion per order/payment. Multiple refund records
        // can complete concurrently; without this lock each could miss the
        // other's uncommitted status and leave a fully-refunded order marked PAID.
        const lockedPaymentOrder = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT p.id
          FROM payments p
          INNER JOIN orders o ON o.id = p.order_id
          WHERE p.id = ${record.paymentId} AND o.id = ${orderId}
          FOR UPDATE OF p, o
        `;
        if (lockedPaymentOrder.length === 0) {
          throw new NotFoundException({ error: 'PAYMENT_OR_ORDER_NOT_FOUND' });
        }

        const updated = await tx.refund.updateMany({
          where: {
            id: record.id,
            status: RefundStatus.PENDING,
            processingToken: token,
          },
          data: {
            status: RefundStatus.PROCESSED,
            gatewayRefundId: gateway.id,
            processedAt: new Date(),
            processingLeaseUntil: null,
            processingToken: null,
          },
        });

        if (updated.count) {
          await this.notifications.enqueueRefundStatus(record.id, orderId, RefundStatus.PROCESSED, tx);
          if (record.returnId) {
            await tx.return.updateMany({
              where: { id: record.returnId, status: ReturnStatus.REFUND_ELIGIBLE },
              data: { status: ReturnStatus.COMPLETED, resolvedAt: new Date() },
            });
          }

          const refundTotals = await tx.refund.aggregate({
            where: { paymentId: record.paymentId, status: RefundStatus.PROCESSED },
            _sum: { amountCents: true },
          });
          const fullyRefunded = (refundTotals._sum.amountCents ?? 0) >= payment.amountCents;

          if (fullyRefunded) {
            await tx.payment.updateMany({
              where: { id: record.paymentId, status: PaymentStatus.CAPTURED },
              data: { status: PaymentStatus.REFUNDED },
            });

            // An order may have more than one captured payment attempt. Mark the
            // order fully refunded only after every captured payment is refunded.
            const remainingCapturedPayments = await tx.payment.count({
              where: { orderId, status: PaymentStatus.CAPTURED },
            });

            if (remainingCapturedPayments === 0) {
              const orderBeforeRefund = await tx.order.findUnique({
                where: { id: orderId },
                select: { status: true },
              });
              const orderUpdate = await tx.order.updateMany({
                where: {
                  id: orderId,
                  status: {
                    in: [
                      OrderStatus.PAID,
                      OrderStatus.PROCESSING,
                      OrderStatus.PACKED,
                      OrderStatus.SHIPPED,
                      OrderStatus.IN_TRANSIT,
                      OrderStatus.OUT_FOR_DELIVERY,
                      OrderStatus.DELIVERED,
                      OrderStatus.RETURN_REQUESTED,
                      OrderStatus.CANCELLED,
                      OrderStatus.PAYMENT_FAILED,
                    ],
                  },
                },
                data: { status: OrderStatus.REFUNDED },
              });
              if (orderUpdate.count === 1 && orderBeforeRefund) {
                await tx.orderStatusHistory.create({
                  data: {
                    orderId,
                    oldStatus: orderBeforeRefund.status,
                    newStatus: OrderStatus.REFUNDED,
                    reason: 'FULL_PAYMENT_REFUND_PROCESSED',
                    changedBy: 'REFUND_WORKFLOW',
                  },
                });
              }
            } else if (record.returnId) {
              // The returned goods are resolved, but another captured payment
              // still funds the order, so the order itself is not fully refunded.
              const restoredOrder = await tx.order.updateMany({
                where: { id: orderId, status: OrderStatus.RETURN_REQUESTED },
                data: { status: OrderStatus.DELIVERED },
              });
              if (restoredOrder.count === 1) {
                await tx.orderStatusHistory.create({
                  data: {
                    orderId,
                    oldStatus: OrderStatus.RETURN_REQUESTED,
                    newStatus: OrderStatus.DELIVERED,
                    reason: 'RETURN_REFUND_PROCESSED_WITH_OTHER_CAPTURED_PAYMENT',
                    changedBy: 'REFUND_WORKFLOW',
                  },
                });
              }
            }
          } else if (record.returnId) {
            // A partial return/refund does not mean the entire order was refunded.
            const restoredOrder = await tx.order.updateMany({
              where: { id: orderId, status: OrderStatus.RETURN_REQUESTED },
              data: { status: OrderStatus.DELIVERED },
            });
            if (restoredOrder.count === 1) {
              await tx.orderStatusHistory.create({
                data: {
                  orderId,
                  oldStatus: OrderStatus.RETURN_REQUESTED,
                  newStatus: OrderStatus.DELIVERED,
                  reason: 'PARTIAL_RETURN_REFUND_PROCESSED',
                  changedBy: 'REFUND_WORKFLOW',
                },
              });
            }
          }
        }

        return tx.refund.findUniqueOrThrow({ where: { id: record.id } });
      });
    } catch (error) {
      // Keep the record PENDING until the lease expires. A retry must reconcile
      // the gateway before attempting another refund, preventing duplicate refunds.
      throw error;
    }
  }

  async reconcilePending(limit = 20) {
    const pending = await this.prisma.refund.findMany({
      where: {
        status: RefundStatus.PENDING,
        OR: [
          { processingLeaseUntil: null },
          { processingLeaseUntil: { lt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const refund of pending) {
      try {
        await this.process(
          refund.orderId,
          refund.amountCents,
          refund.reason,
          refund.returnId ?? undefined,
          refund.idempotencyKey,
        );
      } catch {
        // Leave PENDING. The lease/reconciliation cycle is the recovery mechanism.
      }
    }
  }
}
