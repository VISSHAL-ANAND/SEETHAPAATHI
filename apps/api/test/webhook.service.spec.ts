import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { WebhookService } from '../src/modules/payments/webhook.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { RazorpayAdapter } from '../src/modules/payments/razorpay.adapter';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { PaymentStatus, OrderStatus } from '@prisma/client';

describe('WebhookService - Authoritative Payment Confirmation & Settlement', () => {
  let service: WebhookService;
  let prisma: any;
  let razorpayAdapter: any;
  let inventoryService: any;
  let paymentsService: any;
  let outboxService: any;
  let notificationService: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ status: PaymentStatus.PENDING }]),
      $executeRaw: jest.fn(),
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      order: {
        updateMany: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      paymentTransaction: {
        create: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
      inventoryReservation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      refund: {
        create: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      couponUsage: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      coupon: {
        update: jest.fn(),
      },
    };

    razorpayAdapter = {
      verifyWebhookSignature: jest.fn(),
    };

    inventoryService = {
      commitReservationsBySession: jest.fn().mockResolvedValue(2),
      cancelReservationsBySession: jest.fn().mockResolvedValue(2),
    };

    paymentsService = {};
    outboxService = {
      enqueueInvoiceGeneration: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = {
      enqueueOrderStatus: jest.fn().mockResolvedValue(undefined),
    };

    service = new WebhookService(
      prisma as unknown as PrismaService,
      razorpayAdapter as unknown as RazorpayAdapter,
      inventoryService as unknown as InventoryService,
      paymentsService as unknown as PaymentsService,
      outboxService,
      notificationService,
    );
  });

  describe('Signature Verification', () => {
    it('throws UnauthorizedException when signature verification fails', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.processRazorpayWebhook('{"event":"payment.captured"}', 'invalid_sig'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Webhook Idempotency & Deduplication', () => {
    it('returns duplicate: true immediately without re-processing if event already processed', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
        eventId: 'evt_123',
        processed: true,
      });

      const body = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_123',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 5000, currency: 'INR' } } },
      });

      const result = await service.processRazorpayWebhook(body, 'valid_sig', 'evt_123');

      expect(result.duplicate).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(inventoryService.commitReservationsBySession).not.toHaveBeenCalled();
    });

    it('MED-01: catches Prisma P2002 on concurrent duplicate webhook registration and returns duplicate: true', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      const p2002Error: any = new Error('Unique constraint failed');
      p2002Error.code = 'P2002';
      prisma.paymentWebhookEvent.create.mockRejectedValue(p2002Error);
      prisma.paymentWebhookEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ eventId: 'evt_concurrent_1', processed: false, processingLeaseUntil: null });
      prisma.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

      const body = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_concurrent_1',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 5000, currency: 'INR' } } },
      });

      const result = await service.processRazorpayWebhook(body, 'valid_sig', 'evt_concurrent_1');

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('returns duplicate: true when payment is already in CAPTURED status', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_captured_already',
        orderId: 'order_1',
        gatewayOrderId: 'order_rzp_dup',
        amountCents: 5000,
        currency: 'INR',
        status: PaymentStatus.CAPTURED,
        order: { status: OrderStatus.PAID, items: [] },
      });

      const body = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_already_captured',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_rzp_dup', amount: 5000, currency: 'INR' } } },
      });

      const result = await service.processRazorpayWebhook(body, 'valid_sig', 'evt_already_captured');

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('payment.captured Handler', () => {
    const validPayload = {
      event: 'payment.captured',
      id: 'evt_cap_1',
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp_99',
            order_id: 'order_rzp_99',
            amount: 25000, // ₹250
            currency: 'INR',
          },
        },
      },
    };

    it('CRIT-01: settles order as PAID and commits reservations inside the transaction on active reservation', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_1',
        orderId: 'order_db_1',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_1',
          status: OrderStatus.PENDING_PAYMENT,
          userId: 'user_1',
          notes: JSON.stringify({ cartId: 'cart_db_1' }),
          items: [{ variantId: 'v1', quantity: 2 }],
        },
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      inventoryService.commitReservationsBySession.mockResolvedValue(1);
      prisma.inventoryReservation.findMany.mockResolvedValue([
        { variantId: 'v1', quantity: 2, status: 'ACTIVE' },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ quantity_available: 10, quantity_reserved: 2 }]);

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_1',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(OrderStatus.PAID);
      expect(prisma.$transaction).toHaveBeenCalled();
      // Verifies CRIT-01: commitReservationsBySession is called with tx
      expect(inventoryService.commitReservationsBySession).toHaveBeenCalledWith('order_db_1', prisma);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order_db_1', status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID },
      });
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_1',
          newStatus: OrderStatus.PAID,
          reason: 'PAYMENT_CAPTURED_WEBHOOK',
        }),
      });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart_db_1', quantity: { lte: 0 } },
      });
    });

    it('HIGH-03: late payment post-expiry allocates available inventory under lock when reservation has expired', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_late',
        orderId: 'order_db_late',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_late',
          status: OrderStatus.PENDING_PAYMENT,
          userId: 'user_1',
          items: [{ variantId: 'v1', quantity: 2 }],
        },
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      // Reservation already expired (0 active committed)
      inventoryService.commitReservationsBySession.mockResolvedValue(0);

      // Inventory check shows sufficient stock available
      prisma.$queryRaw.mockResolvedValue([{ quantity_available: 10, quantity_reserved: 0 }]);
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_1',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(OrderStatus.PAID);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          variantId: 'v1',
          delta: -2,
          reason: 'SALE_COMMITTED_POST_EXPIRY',
          referenceId: 'order_db_late',
        }),
      });
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_late',
          newStatus: OrderStatus.PAID,
          reason: 'PAYMENT_CAPTURED_POST_EXPIRY_STOCK_ALLOCATED',
        }),
      });
    });

    it('queues a refund when a captured payment races with an already-cancelled order', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_cancel_race',
        orderId: 'order_db_cancel_race',
        gatewayOrderId: 'order_rzp_cancel_race',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_cancel_race',
          status: OrderStatus.CANCELLED,
          userId: 'user_1',
          items: [{ variantId: 'v1', quantity: 2 }],
        },
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_cancel_race',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(inventoryService.cancelReservationsBySession).toHaveBeenCalledWith('order_db_cancel_race', prisma);
      expect(inventoryService.commitReservationsBySession).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(prisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_cancel_race',
          paymentId: 'pay_db_cancel_race',
          amountCents: 25000,
          status: 'PENDING',
          reason: 'REFUND_REQUIRED_OTHER',
          idempotencyKey: 'auto-refund-order-not-pending:pay_db_cancel_race',
        }),
      });
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: 'pay_db_cancel_race',
          eventType: 'payment.captured.order_not_pending',
        }),
      });
      expect(prisma.paymentWebhookEvent.update).toHaveBeenCalled();
    });

    it('refunds a late capture when the payment-failed webhook already finalized the order', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_failed_then_captured',
        orderId: 'order_db_failed_then_captured',
        gatewayOrderId: 'order_rzp_failed_then_captured',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.FAILED,
        order: {
          id: 'order_db_failed_then_captured',
          status: OrderStatus.PAYMENT_FAILED,
          userId: 'user_1',
          items: [{ variantId: 'v1', quantity: 2 }],
        },
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_after_failed',
      );

      expect(result.status).toBe(OrderStatus.PAYMENT_FAILED);
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'pay_db_failed_then_captured',
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED],
          },
        },
        data: {
          status: PaymentStatus.CAPTURED,
          gatewayPaymentId: expect.any(String),
        },
      });
      expect(prisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_failed_then_captured',
          paymentId: 'pay_db_failed_then_captured',
          idempotencyKey: 'auto-refund-order-not-pending:pay_db_failed_then_captured',
        }),
      });
      expect(inventoryService.commitReservationsBySession).not.toHaveBeenCalled();
    });

    it('settles mixed active and expired reservations without leaving any order line unallocated', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_mixed',
        orderId: 'order_db_mixed',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_mixed',
          status: OrderStatus.PENDING_PAYMENT,
          userId: 'user_1',
          items: [
            { variantId: 'v1', quantity: 2 },
            { variantId: 'v2', quantity: 3 },
          ],
        },
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      inventoryService.commitReservationsBySession.mockResolvedValue(1);
      prisma.inventoryReservation.findMany.mockResolvedValue([
        { variantId: 'v1', quantity: 2, status: 'ACTIVE' },
        { variantId: 'v2', quantity: 3, status: 'EXPIRED' },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ quantity_available: 10, quantity_reserved: 0 }]);
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_mixed',
      );

      expect(result.status).toBe(OrderStatus.PAID);
      expect(inventoryService.commitReservationsBySession).toHaveBeenCalledWith('order_db_mixed', prisma);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          variantId: 'v2',
          delta: -3,
          reason: 'SALE_COMMITTED_POST_EXPIRY',
          referenceId: 'order_db_mixed',
        }),
      });
      expect(prisma.refund.create).not.toHaveBeenCalled();
    });

    it('HIGH-03: late payment post-expiry cancels order for refund when stock is unavailable', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_late_oos',
        orderId: 'order_db_late_oos',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_late_oos',
          status: OrderStatus.PENDING_PAYMENT,
          userId: 'user_1',
          items: [{ variantId: 'v1', quantity: 5 }],
        },
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      inventoryService.commitReservationsBySession.mockResolvedValue(0);

      // Inventory check shows zero available stock
      prisma.$queryRaw.mockResolvedValue([{ quantity_available: 0, quantity_reserved: 0 }]);

      const result = await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_1',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(OrderStatus.CANCELLED);
      // Payment is CAPTURED in DB (since Razorpay charged the card)
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay_db_late_oos', status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED] } },
        data: { status: PaymentStatus.CAPTURED, gatewayPaymentId: 'pay_rzp_99' },
      });
      // Order is CANCELLED for refund
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order_db_late_oos', status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_late_oos',
          newStatus: OrderStatus.CANCELLED,
          reason: 'PAYMENT_CAPTURED_OUT_OF_STOCK_REQUIRES_REFUND',
        }),
      });
      expect(prisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order_db_late_oos',
          paymentId: 'pay_db_late_oos',
          amountCents: 25000,
          status: 'PENDING',
          reason: 'REFUND_REQUIRED_OTHER',
          idempotencyKey: 'auto-refund-out-of-stock:pay_db_late_oos',
        }),
      });
    });

    it('HIGH-04: records coupon usage and increments coupon usageCount on successful payment capture', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_coupon',
        orderId: 'order_db_coupon',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        order: {
          id: 'order_db_coupon',
          status: OrderStatus.PENDING_PAYMENT,
          userId: 'user_coupon_1',
          notes: JSON.stringify({ couponId: 'coupon_uuid_1', couponCode: 'SAVE10' }),
          items: [{ variantId: 'v1', quantity: 1 }],
        },
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      inventoryService.commitReservationsBySession.mockResolvedValue(1);
      prisma.inventoryReservation.findMany.mockResolvedValue([
        { variantId: 'v1', quantity: 1, status: 'ACTIVE' },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ quantity_available: 10, quantity_reserved: 1 }]);
      prisma.couponUsage.findFirst.mockResolvedValue(null); // Not recorded yet

      await service.processRazorpayWebhook(
        JSON.stringify(validPayload),
        'valid_sig',
        'evt_cap_1',
      );

      expect(prisma.couponUsage.create).toHaveBeenCalledWith({
        data: {
          couponId: 'coupon_uuid_1',
          userId: 'user_coupon_1',
          orderId: 'order_db_coupon',
        },
      });
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon_uuid_1' },
        data: { usageCount: { increment: 1 } },
      });
    });

    it('rejects with BadRequestException if payment amount does not match recorded order amount', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_1',
        orderId: 'order_db_1',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 50000, // ₹500 recorded in DB, but webhook is ₹250!
        currency: 'INR',
      });

      await expect(
        service.processRazorpayWebhook(JSON.stringify(validPayload), 'valid_sig', 'evt_cap_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException if payment currency does not match', async () => {
      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_1',
        orderId: 'order_db_1',
        gatewayOrderId: 'order_rzp_99',
        amountCents: 25000,
        currency: 'USD', // Currency mismatch!
      });

      await expect(
        service.processRazorpayWebhook(JSON.stringify(validPayload), 'valid_sig', 'evt_cap_1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('payment.failed Handler', () => {
    it('CRIT-01: marks order as PAYMENT_FAILED and cancels reservations inside the transaction on payment.failed', async () => {
      const failPayload = {
        event: 'payment.failed',
        id: 'evt_fail_1',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_fail',
              order_id: 'order_rzp_fail',
              amount: 25000,
              currency: 'INR',
              error_description: 'Card expired',
            },
          },
        },
      };

      razorpayAdapter.verifyWebhookSignature.mockReturnValue(true);
      prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentWebhookEvent.create.mockResolvedValue({});
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_db_fail',
        orderId: 'order_db_fail',
        gatewayOrderId: 'order_rzp_fail',
        status: PaymentStatus.PENDING,
      });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processRazorpayWebhook(
        JSON.stringify(failPayload),
        'valid_sig',
        'evt_fail_1',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(OrderStatus.PAYMENT_FAILED);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order_db_fail', status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });
      // Verifies CRIT-01: cancelReservationsBySession is called with tx
      expect(inventoryService.cancelReservationsBySession).toHaveBeenCalledWith('order_db_fail', prisma);
    });
  });
});
