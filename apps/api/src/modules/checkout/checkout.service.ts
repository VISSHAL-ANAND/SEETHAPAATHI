import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService, CartItemInput, CouponInput } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderNumberService } from './order-number.service';
import { RazorpayAdapter } from '../payments/razorpay.adapter';
import {
  CreateCheckoutIntentRequest,
  CheckoutIntentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '@seethapaati/contracts';
import { DiscountType, OrderStatus, PaymentGateway, PaymentStatus } from '@prisma/client';
import { TaxConfigurationService } from '../invoicing/tax-configuration.service';

const MAX_DISTINCT_VARIANTS_PER_CHECKOUT = 20;

/**
 * CHECKOUT SERVICE
 *
 * Orchestrates checkout session, pricing calculation, batch inventory reservation,
 * order creation, and external Razorpay order generation.
 *
 * Key Architecture Guarantees:
 * - Pricing is 100% server-authoritative (never trusts client prices)
 * - Deterministic, deadlock-free batch row locking (SELECT ... FOR UPDATE)
 * - Strict transaction boundaries: Razorpay HTTP calls NEVER run inside DB transactions
 * - Webhook is authoritative for payment confirmation; client verify is read-only
 * - Idempotency guard prevents duplicate order/payment creation
 * - Deterministic retry path for transient gateway failures (HIGH-05)
 * - Pessimistic row lock on coupon to prevent concurrent usage over-allocation (MED-NEW-01)
 * - Pass txClient to reserveBatch for atomic transaction rollback (MED-NEW-03)
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private pricingService: PricingService,
    private inventoryService: InventoryService,
    private orderNumberService: OrderNumberService,
    private razorpayAdapter: RazorpayAdapter,
    private taxConfig: TaxConfigurationService,
  ) {}

  /**
   * Create Checkout Intent:
   * 1. Check idempotency key for duplicate request or retry
   * 2. Validate cart and stock availability
   * 3. In PostgreSQL transaction: reserve stock (using tx) + lock coupon + create/update order + create/update payment
   * 4. Outside transaction: create Razorpay order with auto-capture
   * 5. Update payment record with real gatewayOrderId
   * 6. Clear user cart upon successful gateway order confirmation
   */
  async createCheckoutIntent(
    userId: string,
    dto: CreateCheckoutIntentRequest,
  ): Promise<CheckoutIntentResponse> {
    // 1. Idempotency Check
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { order: true },
    });

    if (existingPayment) {
      if (existingPayment.order.userId !== userId) {
        throw new ForbiddenException({
          error: 'IDEMPOTENCY_KEY_COLLISION',
          message: 'Idempotency key already used for a different customer',
        });
      }

      if (existingPayment.status === PaymentStatus.REFUNDED) {
        throw new ConflictException({
          error: 'CHECKOUT_INTENT_REFUNDED',
          message: 'The checkout intent associated with this idempotency key was refunded.',
        });
      }

      // If order was already paid or payment is CAPTURED, return existing intent
      if (
        existingPayment.status === PaymentStatus.CAPTURED ||
        existingPayment.order.status === OrderStatus.PAID
      ) {
        return {
          orderId: existingPayment.order.id,
          orderNumber: existingPayment.order.orderNumber,
          amountCents: existingPayment.amountCents,
          currency: existingPayment.currency,
          gateway: 'RAZORPAY',
          gatewayOrderId: existingPayment.gatewayOrderId,
          gatewayKeyId: this.razorpayAdapter.getKeyId(),
        };
      }

      // If PENDING and has a completed gateway order ID (not pending_...), return existing intent
      if (
        existingPayment.status === PaymentStatus.PENDING &&
        !existingPayment.gatewayOrderId.startsWith('pending_')
      ) {
        this.logger.log(
          `Returning existing checkout intent for idempotencyKey ${dto.idempotencyKey} (order ${existingPayment.orderId})`,
        );

        return {
          orderId: existingPayment.order.id,
          orderNumber: existingPayment.order.orderNumber,
          amountCents: existingPayment.amountCents,
          currency: existingPayment.currency,
          gateway: 'RAZORPAY',
          gatewayOrderId: existingPayment.gatewayOrderId,
          gatewayKeyId: this.razorpayAdapter.getKeyId(),
        };
      }

      // If FAILED or interrupted pending_ intent:
      // Allow deterministic retry reusing existing order/payment identity (HIGH-05)
    }

    // 2. Fetch and Validate Cart
    const cart = await this.prisma.cart.findUnique({
      where: { id: dto.cartId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, status: true } },
                inventory: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException({ error: 'CART_NOT_FOUND', message: 'Cart not found' });
    }

    // Ownership check: cart must belong to the authenticated user
    if (cart.userId !== userId) {
      throw new ForbiddenException({
        error: 'CART_OWNERSHIP_MISMATCH',
        message: 'You cannot checkout with another user’s cart',
      });
    }

    if (cart.items.length === 0) {
      throw new BadRequestException({ error: 'EMPTY_CART', message: 'Your cart is empty' });
    }

    if (cart.items.length > MAX_DISTINCT_VARIANTS_PER_CHECKOUT) {
      throw new BadRequestException({
        error: 'MAX_VARIANTS_EXCEEDED',
        message: `Maximum ${MAX_DISTINCT_VARIANTS_PER_CHECKOUT} distinct variants allowed per checkout`,
      });
    }

    // Validate that products & variants are ACTIVE
    for (const item of cart.items) {
      if (item.variant.status !== 'ACTIVE' || item.variant.product.status !== 'ACTIVE') {
        throw new BadRequestException({
          error: 'PRODUCT_UNAVAILABLE',
          message: `Item "${item.variant.product.name}" is no longer available`,
          variantId: item.variantId,
        });
      }
    }

    const orderId = existingPayment ? existingPayment.order.id : randomUUID();
    const existingOrderNumber = existingPayment ? existingPayment.order.orderNumber : null;

    // 3. DB TRANSACTION: Reserve stock (with tx) + Lock Coupon + Create/Update Order + Payment (PENDING)
    const { order, orderNumber, breakdown } = await this.prisma.$transaction(async (tx) => {
      // 3a. Atomic batch inventory reservation with deterministic locking inside tx (MED-NEW-03)
      await this.inventoryService.reserveBatch(
        {
          items: cart.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          checkoutSessionId: orderId,
        },
        tx,
      );

      // 3b. Coupon validation under row-level lock (MED-NEW-01)
      let couponInput: CouponInput | null = null;
      let couponId: string | null = null;

      if (dto.couponCode) {
        const couponRows = await tx.$queryRaw<Array<{
          id: string;
          code: string;
          discount_type: DiscountType;
          discount_value: number;
          min_order_cents: number;
          max_discount_cents: number | null;
          usage_limit: number | null;
          usage_count: number;
          starts_at: Date;
          expires_at: Date | null;
          is_active: boolean;
        }>>`
          SELECT id, code, discount_type, discount_value, min_order_cents, max_discount_cents,
                 usage_limit, usage_count, starts_at, expires_at, is_active
          FROM coupons
          WHERE code = ${dto.couponCode.toUpperCase()}
          FOR UPDATE
        `;

        if (!couponRows || couponRows.length === 0) {
          throw new BadRequestException({ error: 'INVALID_COUPON', message: 'Invalid coupon code' });
        }

        const coupon = couponRows[0];
        if (!coupon.is_active) {
          throw new BadRequestException({ error: 'INVALID_COUPON', message: 'Coupon is no longer active' });
        }

        const now = new Date();
        const isValidDate = (!coupon.starts_at || coupon.starts_at <= now) && (!coupon.expires_at || coupon.expires_at >= now);
        if (!isValidDate) {
          throw new BadRequestException({ error: 'INVALID_COUPON', message: 'Coupon is expired' });
        }

        if (coupon.usage_limit !== null) {
          // Count active in-flight checkout reservations for this coupon, excluding current orderId on retry
          const [claimRow] = await tx.$queryRaw<Array<{ count: bigint | number | string }>>`
            SELECT COUNT(DISTINCT o.id)::int as count
            FROM orders o
            JOIN inventory_reservations r ON r.checkout_session_id = o.id
            WHERE o.status = 'PENDING_PAYMENT'
              AND r.status = 'ACTIVE'
              AND r.expires_at > (NOW() AT TIME ZONE 'UTC')
              AND o.id != ${orderId}
              AND o.notes LIKE ${'%"couponId":"' + coupon.id + '"%'}
          `;

          const activeClaims = claimRow ? Number(claimRow.count) : 0;
          const effectiveUsage = coupon.usage_count + activeClaims;

          if (effectiveUsage >= coupon.usage_limit) {
            throw new BadRequestException({
              error: 'INVALID_COUPON',
              message: 'Coupon usage limit reached',
            });
          }
        }

        couponInput = {
          code: coupon.code,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
          minOrderCents: coupon.min_order_cents,
          maxDiscountCents: coupon.max_discount_cents,
        };
        couponId = coupon.id;
      }

      // 3c. Validate HSN/tax configuration before creating the paid-order snapshot
      const taxRates = new Map<string, number>();
      for (const item of cart.items) {
        const hsnCode = item.variant.hsnCode;
        if (!hsnCode) throw new BadRequestException({ error: 'TAX_CONFIGURATION_MISSING', message: `HSN code missing for ${item.variant.sku}` });
        const rate = await this.taxConfig.getRate(hsnCode, tx);
        taxRates.set(hsnCode, rate.taxRatePercent);
      }

      // 3d. Server-Authoritative Price Calculation
      const pricingInputs: CartItemInput[] = cart.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        sku: item.variant.sku,
        packType: item.variant.packType,
        weightGrams: item.variant.weightGrams,
        quantity: item.quantity,
        unitPriceCents: item.variant.priceCents,
      }));

      const { lineItems, breakdown: computedBreakdown } = this.pricingService.calculate(pricingInputs, couponInput, new Map(cart.items.map((item) => [item.variantId, taxRates.get(item.variant.hsnCode!)!])) );

      if (computedBreakdown.grandTotalCents <= 0) {
        throw new BadRequestException({
          error: 'INVALID_ORDER_TOTAL',
          message: 'Order total must be greater than zero',
        });
      }

      const resolvedOrderNumber = existingOrderNumber ?? (await this.orderNumberService.generateOrderNumber(tx));

      // 3d. Create or Update Order record (HIGH-05 retry support)
      let activeOrder: any;
      if (existingPayment) {
        activeOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.PENDING_PAYMENT,
            subtotalCents: computedBreakdown.subtotalCents,
            discountCents: computedBreakdown.couponDiscountCents,
            taxCents: computedBreakdown.taxCents,
            shippingCents: computedBreakdown.shippingCents,
            grandTotalCents: computedBreakdown.grandTotalCents,
            shippingAddressSnapshot: dto.shippingAddress,
            billingAddressSnapshot: dto.shippingAddress,
            notes: JSON.stringify({
              cartId: cart.id,
              ...(couponId ? { couponId, couponCode: dto.couponCode } : {}),
            }),
          },
        });

        // Recreate order items with reconciled line totals
        await tx.orderItem.deleteMany({ where: { orderId } });
      } else {
        activeOrder = await tx.order.create({
          data: {
            id: orderId,
            orderNumber: resolvedOrderNumber,
            userId,
            status: OrderStatus.PENDING_PAYMENT,
            currency: 'INR',
            subtotalCents: computedBreakdown.subtotalCents,
            discountCents: computedBreakdown.couponDiscountCents,
            taxCents: computedBreakdown.taxCents,
            shippingCents: computedBreakdown.shippingCents,
            grandTotalCents: computedBreakdown.grandTotalCents,
            shippingAddressSnapshot: dto.shippingAddress,
            billingAddressSnapshot: dto.shippingAddress,
            notes: JSON.stringify({
              cartId: cart.id,
              ...(couponId ? { couponId, couponCode: dto.couponCode } : {}),
            }),
          },
        });
      }

      // 3e. Create immutable OrderItem snapshots with reconciled tax distribution
      const totalTaxCents = computedBreakdown.taxCents;
      const totalSubtotalCents = computedBreakdown.subtotalCents;

      let allocatedTaxSum = 0;
      const itemTaxAllocations = lineItems.map((li) => {
        const share = totalSubtotalCents > 0
          ? Math.floor((li.lineTotalCents / totalSubtotalCents) * totalTaxCents)
          : 0;
        allocatedTaxSum += share;
        return share;
      });

      let taxRemainder = totalTaxCents - allocatedTaxSum;
      let idx = 0;
      while (taxRemainder > 0 && idx < itemTaxAllocations.length) {
        itemTaxAllocations[idx]++;
        taxRemainder--;
        idx++;
      }

      const orderItemData = lineItems.map((li, i) => ({
        orderId,
        variantId: li.variantId,
        productNameSnapshot: li.productName,
        skuSnapshot: li.sku,
        packTypeSnapshot: li.packType,
        weightGramsSnapshot: li.weightGrams,
        hsnCodeSnapshot: cart.items[i].variant.hsnCode,
        unitTaxRatePercent: taxRates.get(cart.items[i].variant.hsnCode!) ?? null,
        unitPriceCents: li.unitPriceCents,
        quantity: li.quantity,
        taxCents: itemTaxAllocations[i],
        lineTotalCents: li.lineTotalCents,
      }));

      await tx.orderItem.createMany({ data: orderItemData });

      // 3f. Record order status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: existingPayment ? existingPayment.order.status : null,
          newStatus: OrderStatus.PENDING_PAYMENT,
          reason: existingPayment ? 'CHECKOUT_RETRY_INITIATED' : 'CHECKOUT_INITIATED',
          changedBy: userId,
        },
      });

      // 3g. Create or update Payment record in PENDING state
      if (existingPayment) {
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.PENDING,
            gatewayOrderId: `pending_${orderId}`,
            amountCents: computedBreakdown.grandTotalCents,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            orderId,
            gateway: PaymentGateway.RAZORPAY,
            gatewayOrderId: `pending_${orderId}`,
            amountCents: computedBreakdown.grandTotalCents,
            currency: 'INR',
            status: PaymentStatus.PENDING,
            idempotencyKey: dto.idempotencyKey,
          },
        });
      }

      return {
        order: activeOrder,
        orderNumber: resolvedOrderNumber,
        breakdown: computedBreakdown,
      };
    });

    // 4. OUTSIDE DB TRANSACTION: Call Razorpay API to create gateway order
    let rzpOrder: { gatewayOrderId: string };
    try {
      rzpOrder = await this.razorpayAdapter.createOrder({
        amountCents: breakdown.grandTotalCents,
        currency: 'INR',
        receipt: orderNumber,
        notes: {
          orderId: order.id,
          userId,
        },
      });

      // Update payment record with real gateway order ID
      await this.prisma.payment.update({
        where: { idempotencyKey: dto.idempotencyKey },
        data: { gatewayOrderId: rzpOrder.gatewayOrderId },
      });

      // Keep the cart intact until Razorpay confirms payment through the webhook.
      // The webhook removes only the quantities included in the immutable order snapshot.
    } catch (err) {
      this.logger.error(
        `Failed to create Razorpay order for order ${order.id}. Releasing reservations: ${(err as Error).message}`,
      );

      // Rollback recovery: cancel reservations and mark order as failed
      await this.inventoryService.cancelReservationsBySession(order.id);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });
      await this.prisma.payment.update({
        where: { idempotencyKey: dto.idempotencyKey },
        data: { status: PaymentStatus.FAILED },
      });

      throw new BadGatewayException({
        error: 'GATEWAY_ORDER_CREATION_FAILED',
        message: 'Could not initialize payment with Razorpay. Please try again.',
      });
    }

    return {
      orderId: order.id,
      orderNumber,
      amountCents: breakdown.grandTotalCents,
      currency: 'INR',
      gateway: 'RAZORPAY',
      gatewayOrderId: rzpOrder.gatewayOrderId,
      gatewayKeyId: this.razorpayAdapter.getKeyId(),
    };
  }

  /**
   * Verify Payment from Frontend Modal Response:
   * Validates client-side Razorpay signature.
   *
   * Note: The order status is NOT updated to PAID here.
   * Webhook is the single authoritative source of truth.
   * This endpoint simply verifies the cryptographic signature and returns current status.
   */
  async verifyPayment(userId: string, dto: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    // Ownership check
    if (order.userId !== userId) {
      throw new ForbiddenException({ error: 'ORDER_FORBIDDEN', message: 'Access denied to this order' });
    }

    const isValid = this.razorpayAdapter.verifyPaymentSignature({
      orderId: dto.razorpay_order_id,
      paymentId: dto.razorpay_payment_id,
      signature: dto.razorpay_signature,
    });

    if (!isValid) {
      this.logger.warn(`Invalid client payment signature for order ${dto.orderId}`);
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      verified: isValid,
    };
  }
}
