import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayAdapter } from './razorpay.adapter';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentsService } from './payments.service';
import { OrderStatus, PaymentStatus, RefundReason, RefundStatus } from '@prisma/client';
import { OutboxService } from '../invoicing/outbox.service';
import { randomUUID } from 'crypto';
import { NotificationService } from '../notifications/notification.service';
import { ShippingService } from '../fulfillment/shipping.service';
import { RedisService } from '../redis/redis.service';

export interface WebhookProcessingResult {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  orderId?: string;
  status?: string;
}

/**
 * WEBHOOK SERVICE
 *
 * Authoritative payment confirmation for Razorpay webhooks.
 * Features:
 * - Timing-safe HMAC-SHA256 signature verification
 * - Webhook event deduplication (event_id in payment_webhook_events)
 * - Concurrency protection against simultaneous duplicate deliveries
 * - Strict payment amount and currency verification
 * - Single-transaction atomic order + payment + inventory commitment
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private razorpayAdapter: RazorpayAdapter,
    private inventoryService: InventoryService,
    private paymentsService: PaymentsService,
    private outboxService: OutboxService,
    private notificationService: NotificationService,
    @Optional() private shippingService?: ShippingService,
    @Optional() private redis?: RedisService,
  ) {}

  /**
   * Process incoming Razorpay webhook.
   */
  async processRazorpayWebhook(
    rawBody: string | Buffer,
    signature: string,
    eventIdHeader?: string,
  ): Promise<WebhookProcessingResult> {
    // 1. Verify webhook signature
    const isValid = this.razorpayAdapter.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('Razorpay webhook signature verification failed');
      throw new UnauthorizedException({
        error: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed',
      });
    }

    // 2. Parse body
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    let payload: any;
    try {
      payload = JSON.parse(bodyStr);
    } catch {
      throw new BadRequestException({ error: 'INVALID_JSON', message: 'Malformed JSON payload' });
    }

    const eventType: string = payload.event;
    // Event ID priority: header > payload.event_id > payload.payload?.payment?.entity?.id + '_' + eventType
    const paymentEntity = payload.payload?.payment?.entity;
    const eventId: string =
      eventIdHeader ||
      payload.event_id ||
      payload.id ||
      (paymentEntity ? `${paymentEntity.id}_${eventType}` : `evt_${Date.now()}_${Math.random()}`);

    // 3. Webhook idempotency + crash-safe lease guard
    let existingEvent = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });

    if (existingEvent?.processed) {
      this.logger.log('Duplicate webhook event ' + eventId + ' already processed, skipping');
      return { success: true, duplicate: true, message: 'Event already processed' };
    }

    if (!existingEvent) {
      try {
        existingEvent = await this.prisma.paymentWebhookEvent.create({
          data: { gateway: 'RAZORPAY', eventId, eventType, payload, processed: false },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        existingEvent = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
      }
    }

    if (!existingEvent) throw new BadRequestException({ error: 'WEBHOOK_EVENT_INITIALIZATION_FAILED' });

    const processingToken = randomUUID();
    const claimed = await this.prisma.paymentWebhookEvent.updateMany({
      where: {
        eventId, processed: false,
        OR: [{ processingLeaseUntil: null }, { processingLeaseUntil: { lt: new Date() } }],
      },
      data: { processingToken, processingLeaseUntil: new Date(Date.now() + 2 * 60 * 1000) },
    });

    if (claimed.count !== 1) {
      const current = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
      if (current?.processed) return { success: true, duplicate: true, message: 'Event already processed' };
      return { success: true, duplicate: true, message: 'Event is already being processed' };
    }

    // 4. Dispatch based on event type
    switch (eventType) {
      case 'payment.captured':
        return await this.handlePaymentCaptured(eventId, paymentEntity, payload);

      case 'payment.failed':
        return await this.handlePaymentFailed(eventId, paymentEntity, payload);

      case 'payment.authorized':
        return await this.handlePaymentAuthorized(eventId, paymentEntity, payload);

      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
        await this.prisma.paymentWebhookEvent.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
        });
        return { success: true, message: `Event ${eventType} received but no action required` };
    }
  }

  /**
   * Handle payment.captured event.
   * Atomically:
   * - Transitions Payment -> CAPTURED
   * - Commits stock reservations (reserved -> permanently sold) inside transaction
   * - Handles late payment post-expiry inventory check
   * - Transitions Order -> PAID (or CANCELLED if stock unavailable)
   * - Records OrderStatusHistory
   * - Updates CouponUsage if coupon was used
   * - Marks webhook event as processed
   */
  private async handlePaymentCaptured(
    eventId: string,
    paymentEntity: any,
    rawPayload: any,
  ): Promise<WebhookProcessingResult> {
    if (!paymentEntity) {
      throw new BadRequestException({ error: 'MISSING_PAYMENT_ENTITY', message: 'No payment entity in webhook payload' });
    }

    const gatewayOrderId: string = paymentEntity.order_id;
    const gatewayPaymentId: string = paymentEntity.id;
    const amountCents: number = Number(paymentEntity.amount);
    const currency: string = paymentEntity.currency;

    const payment = await this.prisma.payment.findUnique({
      where: { gatewayOrderId },
      include: { order: { include: { items: true } } },
    });

    if (!payment) {
      throw new NotFoundException({
        error: 'PAYMENT_NOT_FOUND',
        message: `Payment record not found for gateway order ${gatewayOrderId}`,
      });
    }

    // Idempotency: skip if already captured
    if (payment.status === PaymentStatus.CAPTURED) {
      this.logger.log(`Payment ${payment.id} for order ${payment.orderId} already CAPTURED, skipping duplicate`);
      await this.prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
      });
      return {
        success: true,
        duplicate: true,
        orderId: payment.orderId,
        status: payment.order?.status ?? OrderStatus.PAID,
      };
    }

    // Amount & Currency Verification: Never trust without strict comparison
    if (payment.amountCents !== amountCents) {
      this.logger.error(
        `Payment amount mismatch for order ${payment.orderId}! Expected: ${payment.amountCents}, received: ${amountCents}`,
      );
      throw new BadRequestException({
        error: 'AMOUNT_MISMATCH',
        message: 'Payment amount does not match order record',
      });
    }

    if (payment.currency !== currency) {
      this.logger.error(
        `Payment currency mismatch for order ${payment.orderId}! Expected: ${payment.currency}, received: ${currency}`,
      );
      throw new BadRequestException({
        error: 'CURRENCY_MISMATCH',
        message: 'Payment currency does not match order record',
      });
    }

    // Atomic database transaction for order + payment + inventory settlement
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize duplicate deliveries on the payment row. Without this lock,
      // a concurrent webhook could observe an already-settled reservation and
      // incorrectly run the post-expiry stock allocation path a second time.
      const lockedPayments = await tx.$queryRaw<Array<{
        status: PaymentStatus;
        order_status: OrderStatus;
      }>>`
        SELECT p.status, o.status AS order_status
        FROM payments p
        INNER JOIN orders o ON o.id = p.order_id
        WHERE p.id = ${payment.id}
        FOR UPDATE OF p, o
      `;
      const lockedPayment = lockedPayments[0];
      if (!lockedPayment) {
        throw new NotFoundException({ error: 'PAYMENT_NOT_FOUND', message: 'Payment or order disappeared during webhook processing.' });
      }
      if (
        lockedPayment.status === PaymentStatus.CAPTURED ||
        lockedPayment.status === PaymentStatus.REFUNDED
      ) {
        await tx.paymentWebhookEvent.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
        });
        return {
          orderId: payment.orderId,
          status: lockedPayment.order_status ?? payment.order?.status ?? OrderStatus.PAID,
          reason: 'DUPLICATE_PAYMENT_CAPTURED_WEBHOOK',
        };
      }

      // A customer may cancel an unpaid order while a delayed gateway capture is
      // arriving. Locking payment + order together prevents stock settlement from
      // racing past that cancellation. Captured money must be refunded, not fulfilled.
      const currentOrderStatus = lockedPayment.order_status ?? payment.order?.status;
      if (currentOrderStatus !== OrderStatus.PENDING_PAYMENT) {
        await this.inventoryService.cancelReservationsBySession(payment.orderId, tx);
        await tx.payment.updateMany({
          where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] } },
          data: { status: PaymentStatus.CAPTURED, gatewayPaymentId },
        });
        await tx.refund.create({
          data: {
            orderId: payment.orderId,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            currency: payment.currency,
            status: RefundStatus.PENDING,
            reason: RefundReason.REFUND_REQUIRED_OTHER,
            idempotencyKey: `auto-refund-order-not-pending:${payment.id}`,
            notes: `Automatic refund required because payment was captured while the order was already ${currentOrderStatus}.`,
          },
        });
        await tx.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            eventType: 'payment.captured.order_not_pending',
            payload: rawPayload,
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
        });
        return {
          orderId: payment.orderId,
          status: currentOrderStatus,
          reason: 'PAYMENT_CAPTURED_ORDER_NOT_PENDING_REFUND_QUEUED',
        };
      }

      // 1. Transition Payment -> CAPTURED
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] } },
        data: {
          status: PaymentStatus.CAPTURED,
          gatewayPaymentId,
        },
      });

      // Lock reservation rows before reading them so the expiry worker cannot
      // release a hold between the reconciliation read and the commit operation.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM inventory_reservations
        WHERE checkout_session_id = ${payment.orderId}
        ORDER BY variant_id ASC, id ASC
        FOR UPDATE
      `;

      // 2. Reconcile every order line against its committed and active reservations.
      // This is deliberately item/quantity based: a non-zero reservation count does
      // not prove that every line in a multi-item order is covered.
      const orderItems = payment.order?.items ?? [];
      const reservations = await tx.inventoryReservation.findMany({
        where: { checkoutSessionId: payment.orderId },
        orderBy: { variantId: 'asc' },
      });

      const requiredByVariant = new Map<string, number>();
      let allStockAvailable = orderItems.length > 0;
      for (const item of orderItems) {
        if (!item.variantId || item.quantity <= 0) {
          allStockAvailable = false;
          continue;
        }
        requiredByVariant.set(
          item.variantId,
          (requiredByVariant.get(item.variantId) ?? 0) + item.quantity,
        );
      }

      const activeByVariant = new Map<string, number>();
      const committedByVariant = new Map<string, number>();
      for (const reservation of reservations) {
        const target = reservation.status === 'ACTIVE'
          ? activeByVariant
          : reservation.status === 'COMMITTED'
            ? committedByVariant
            : null;
        if (target) {
          target.set(
            reservation.variantId,
            (target.get(reservation.variantId) ?? 0) + reservation.quantity,
          );
        }
      }

      // A reservation for a line that no longer exists in the immutable order
      // snapshot indicates corrupted checkout state; do not fulfill it.
      for (const [variantId, quantity] of [...activeByVariant, ...committedByVariant]) {
        if (!requiredByVariant.has(variantId) || quantity <= 0) {
          allStockAvailable = false;
        }
      }

      const missingAllocations: Array<{ variantId: string; quantity: number }> = [];
      const variantsToLock = new Set<string>(requiredByVariant.keys());
      for (const reservation of reservations) {
        if (reservation.status === 'ACTIVE' || reservation.status === 'COMMITTED') {
          variantsToLock.add(reservation.variantId);
        }
      }
      const sortedVariantIds = [...variantsToLock].sort((a, b) => a.localeCompare(b));

      // Lock all inventory rows in one deterministic order before committing any
      // reservation or allocating an expired/missing quantity.
      const inventoryByVariant = new Map<
        string,
        { quantity_available: number; quantity_reserved: number }
      >();
      for (const variantId of sortedVariantIds) {
        const [row] = await tx.$queryRaw<Array<{
          quantity_available: number;
          quantity_reserved: number;
        }>>`
          SELECT quantity_available, quantity_reserved
          FROM inventory
          WHERE variant_id = ${variantId}
          FOR UPDATE
        `;
        if (row) inventoryByVariant.set(variantId, row);
        else allStockAvailable = false;
      }

      for (const variantId of sortedVariantIds) {
        const required = requiredByVariant.get(variantId) ?? 0;
        const active = activeByVariant.get(variantId) ?? 0;
        const committed = committedByVariant.get(variantId) ?? 0;
        const missing = required - active - committed;
        const inventory = inventoryByVariant.get(variantId);

        if (missing < 0 || !inventory || (inventory.quantity_available - inventory.quantity_reserved) < missing) {
          allStockAvailable = false;
          continue;
        }
        if (missing > 0) missingAllocations.push({ variantId, quantity: missing });
      }

      let orderFinalStatus: OrderStatus = OrderStatus.PAID;
      let orderStatusReason = 'PAYMENT_CAPTURED_WEBHOOK';

      if (allStockAvailable) {
        await this.inventoryService.commitReservationsBySession(payment.orderId, tx);

        for (const allocation of missingAllocations) {
          await tx.$executeRaw`
            UPDATE inventory
            SET quantity_available = quantity_available - ${allocation.quantity},
                version = version + 1,
                updated_at = NOW()
            WHERE variant_id = ${allocation.variantId}
          `;
          await tx.inventoryMovement.create({
            data: {
              variantId: allocation.variantId,
              delta: -allocation.quantity,
              reason: 'SALE_COMMITTED_POST_EXPIRY',
              referenceId: payment.orderId,
            },
          });
        }

        if (missingAllocations.length > 0) {
          orderStatusReason = activeByVariant.size > 0
            ? 'PAYMENT_CAPTURED_MIXED_RESERVATION_STOCK_ALLOCATED'
            : 'PAYMENT_CAPTURED_POST_EXPIRY_STOCK_ALLOCATED';
        }
      } else {
        // Do not commit a subset of the order. Release all still-active holds and
        // queue a full refund because Razorpay has already captured the payment.
        await this.inventoryService.cancelReservationsBySession(payment.orderId, tx);

        // If an older/partially-completed attempt left committed reservations,
        // restore those quantities because this whole order is being refunded.
        for (const reservation of reservations) {
          if (reservation.status !== 'COMMITTED') continue;
          const reversed = await tx.inventoryReservation.updateMany({
            where: { id: reservation.id, status: 'COMMITTED' },
            data: { status: 'CANCELLED' },
          });
          if (reversed.count === 1) {
            await tx.$executeRaw`
              UPDATE inventory
              SET quantity_available = quantity_available + ${reservation.quantity},
                  version = version + 1,
                  updated_at = NOW()
              WHERE variant_id = ${reservation.variantId}
            `;
            await tx.inventoryMovement.create({
              data: {
                variantId: reservation.variantId,
                delta: reservation.quantity,
                reason: 'SALE_COMMIT_ROLLED_BACK_REFUND',
                referenceId: reservation.id,
              },
            });
          }
        }

        orderFinalStatus = OrderStatus.CANCELLED;
        orderStatusReason = 'PAYMENT_CAPTURED_OUT_OF_STOCK_REQUIRES_REFUND';
        this.logger.error(
          `Payment captured for order ${payment.orderId} but all line quantities could not be allocated. Order cancelled and refund queued.`,
        );
      }

      // 4. Update Order status
      const orderUpdate = await tx.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: orderFinalStatus },
      });

      if (orderUpdate.count === 1) {
        await tx.orderStatusHistory.create({
          data: { orderId: payment.orderId, oldStatus: OrderStatus.PENDING_PAYMENT, newStatus: orderFinalStatus, reason: orderStatusReason, changedBy: 'RAZORPAY_WEBHOOK' },
        });
        await this.notificationService.enqueueOrderStatus(payment.orderId, orderFinalStatus, tx);
      }

      // 4a. A captured payment with no complete stock allocation must enter
      // the existing refund reconciliation workflow; never leave it as a manual note.
      if (orderFinalStatus === OrderStatus.CANCELLED) {
        await tx.refund.create({
          data: {
            orderId: payment.orderId,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            currency: payment.currency,
            status: RefundStatus.PENDING,
            reason: RefundReason.REFUND_REQUIRED_OTHER,
            idempotencyKey: `auto-refund-out-of-stock:${payment.id}`,
            notes: 'Automatic refund required because the complete order quantity could not be allocated after payment capture.',
          },
        });
      }

      // 5. Record transaction ledger entry
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          eventType: 'payment.captured',
          payload: rawPayload,
        },
      });

      // 5a. Remove only the quantities purchased from the original cart.
      // Items added or increased while payment was pending remain in the cart.
      if (orderFinalStatus === OrderStatus.PAID && payment.order?.notes) {
        let cartId: string | undefined;
        try {
          const checkoutNotes = JSON.parse(payment.order.notes);
          if (typeof checkoutNotes?.cartId === 'string' && checkoutNotes.cartId.length > 0) {
            cartId = checkoutNotes.cartId;
          }
        } catch {
          // Older orders may contain non-JSON notes; leave their cart untouched.
        }

        if (cartId) {
          for (const [variantId, purchasedQuantity] of requiredByVariant) {
            await tx.$executeRaw`
              UPDATE cart_items
              SET quantity = GREATEST(0, quantity - ${purchasedQuantity}),
                  updated_at = NOW()
              WHERE cart_id = ${cartId}
                AND variant_id = ${variantId}
            `;
          }
          await tx.cartItem.deleteMany({
            where: { cartId, quantity: { lte: 0 } },
          });
        }
      }

      // 6. Record Coupon Usage (HIGH-04) if coupon was applied and order was paid
      if (orderFinalStatus === OrderStatus.PAID && payment.order?.notes) {
        try {
          const notesData = JSON.parse(payment.order.notes);
          if (notesData?.couponId) {
            const existingUsage = await tx.couponUsage.findFirst({
              where: { orderId: payment.orderId, couponId: notesData.couponId },
            });

            if (!existingUsage) {
              await tx.couponUsage.create({
                data: {
                  couponId: notesData.couponId,
                  userId: payment.order.userId,
                  orderId: payment.orderId,
                },
              });

              await tx.coupon.update({
                where: { id: notesData.couponId },
                data: { usageCount: { increment: 1 } },
              });

              this.logger.log(
                `Recorded coupon usage for coupon ${notesData.couponId} on order ${payment.orderId}`,
              );
            }
          }
        } catch {
          // Non-critical if notes parsing fails
        }
      }

      // 7. Queue invoice generation atomically with payment settlement
      if (orderFinalStatus === OrderStatus.PAID) {
        await this.outboxService.enqueueInvoiceGeneration(payment.orderId, tx);
      }

      // 8. Mark webhook event as processed
      await tx.paymentWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
      });

      return {
        orderId: payment.orderId,
        status: orderFinalStatus,
        reason: orderStatusReason,
      };
    });

    this.logger.log(
      `Order ${result.orderId} finalized as ${result.status} (${result.reason}) via webhook`,
    );

    if (this.redis) {
      await this.redis.delByPattern('catalog:*');
    }

    // Push paid order to Shiprocket in background if configured
    // Order confirmed as PAID - ready for India Post dispatch
    if (result.status === OrderStatus.PAID) {
      this.logger.log(`Order ${result.orderId} is confirmed and queued for India Post fulfillment`);
    }


    return {
      success: true,
      orderId: result.orderId,
      status: result.status,
    };
  }

  /**
   * Handle payment.failed event.
   * Atomically:
   * - Transitions Payment -> FAILED
   * - Transitions Order -> PAYMENT_FAILED
   * - Cancels/releases stock reservations back to available pool within the same transaction
   */
  private async handlePaymentFailed(
    eventId: string,
    paymentEntity: any,
    rawPayload: any,
  ): Promise<WebhookProcessingResult> {
    if (!paymentEntity) {
      throw new BadRequestException({ error: 'MISSING_PAYMENT_ENTITY', message: 'No payment entity in webhook payload' });
    }

    const gatewayOrderId: string = paymentEntity.order_id;
    const gatewayPaymentId: string = paymentEntity.id;

    const payment = await this.prisma.payment.findUnique({
      where: { gatewayOrderId },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(`Failed payment webhook for unknown gateway order: ${gatewayOrderId}`);
      await this.prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
      });
      return { success: false, message: 'Payment record not found' };
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Transition Payment -> FAILED
      await tx.payment.updateMany({
        where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] } },
        data: { status: PaymentStatus.FAILED, gatewayPaymentId },
      });

      // 2. Transition Order -> PAYMENT_FAILED
      const orderUpdate = await tx.order.updateMany({
        where: { id: payment.orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });

      if (orderUpdate.count === 1) {
        await tx.orderStatusHistory.create({
          data: { orderId: payment.orderId, oldStatus: OrderStatus.PENDING_PAYMENT, newStatus: OrderStatus.PAYMENT_FAILED, reason: paymentEntity.error_description || 'PAYMENT_FAILED_WEBHOOK', changedBy: 'RAZORPAY_WEBHOOK' },
        });
        await this.notificationService.enqueueOrderStatus(payment.orderId, OrderStatus.PAYMENT_FAILED, tx);
      }

      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          eventType: 'payment.failed',
          payload: rawPayload,
        },
      });

      // 3. Cancel stock reservations inside the transaction (CRIT-01)
      await this.inventoryService.cancelReservationsBySession(payment.orderId, tx);

      await tx.paymentWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
      });
    });

    this.logger.log(`Order ${payment.orderId} marked as PAYMENT_FAILED, reservations cancelled`);

    return {
      success: true,
      orderId: payment.orderId,
      status: OrderStatus.PAYMENT_FAILED,
    };
  }

  /**
   * Handle payment.authorized event.
   */
  private async handlePaymentAuthorized(
    eventId: string,
    paymentEntity: any,
    rawPayload: any,
  ): Promise<WebhookProcessingResult> {
    if (!paymentEntity) return { success: true };

    const gatewayOrderId: string = paymentEntity.order_id;
    const payment = await this.prisma.payment.findUnique({
      where: { gatewayOrderId },
    });

    if (payment && payment.status === PaymentStatus.PENDING) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.AUTHORIZED },
      });

      await this.prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          eventType: 'payment.authorized',
          payload: rawPayload,
        },
      });
    }

    await this.prisma.paymentWebhookEvent.update({
      where: { eventId },
      data: { processed: true, processedAt: new Date(), processingLeaseUntil: null, processingToken: null },
    });

    return { success: true, message: 'Payment authorized recorded' };
  }
}
