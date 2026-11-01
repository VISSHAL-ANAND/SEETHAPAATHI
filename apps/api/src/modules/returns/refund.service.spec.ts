import { ConflictException } from '@nestjs/common';
import { RefundReason, RefundStatus } from '@prisma/client';
import { RefundService } from './refund.service';

describe('RefundService idempotency', () => {
  const existing = {
    id: 'refund-1',
    orderId: 'order-1',
    paymentId: 'payment-1',
    returnId: null,
    amountCents: 1200,
    reason: RefundReason.REFUND_REQUIRED_OTHER,
    idempotencyKey: 'key-1',
    status: RefundStatus.PENDING,
  };

  let prisma: any;
  let razorpay: any;
  let service: RefundService;

  beforeEach(() => {
    prisma = { refund: { findUnique: jest.fn().mockResolvedValue(existing) } };
    razorpay = {
      findRefundByInternalId: jest.fn(),
      createRefund: jest.fn(),
    };
    service = new RefundService(prisma, razorpay, {} as any);
  });

  const mismatches: Array<[string, { orderId?: string; amountCents?: number; reason?: RefundReason; returnId?: string }]> = [
    ['orderId', { orderId: 'order-2' }],
    ['amountCents', { amountCents: 1300 }],
    ['reason', { reason: RefundReason.RETURN }],
    ['returnId', { returnId: 'return-1' }],
  ];

  it.each(mismatches)('rejects reuse of the same key with a different %s', async (_field, change) => {
    await expect(
      service.process(
        change.orderId ?? 'order-1',
        change.amountCents ?? 1200,
        change.reason ?? RefundReason.REFUND_REQUIRED_OTHER,
        change.returnId,
        'key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(razorpay.findRefundByInternalId).not.toHaveBeenCalled();
    expect(razorpay.createRefund).not.toHaveBeenCalled();
  });
});
