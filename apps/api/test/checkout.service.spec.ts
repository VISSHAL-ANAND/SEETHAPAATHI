import {
  BadRequestException,
  ForbiddenException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { OrderNumberService } from '../src/modules/checkout/order-number.service';
import { RazorpayAdapter } from '../src/modules/payments/razorpay.adapter';
import { TaxConfigurationService } from '../src/modules/invoicing/tax-configuration.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('CheckoutService - Orchestration & Integrity', () => {
  let service: CheckoutService;
  let prisma: any;
  let pricingService: any;
  let inventoryService: any;
  let orderNumberService: any;
  let razorpayAdapter: any;
  let taxConfig: any;

  const userId = 'u1111111-1111-1111-1111-111111111111';
  const cartId = 'c1111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      $queryRaw: jest.fn(),
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cart: {
        findUnique: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      coupon: {
        findUnique: jest.fn(),
      },
      order: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      orderItem: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
    };

    pricingService = {
      calculate: jest.fn().mockReturnValue({
        lineItems: [
          {
            variantId: 'var_1',
            productName: 'Organic Pepper',
            sku: 'PEPPER-100G',
            packType: 'Pouch',
            weightGrams: 100,
            quantity: 2,
            unitPriceCents: 15000,
            lineTotalCents: 30000,
          },
        ],
        breakdown: {
          subtotalCents: 30000,
          couponDiscountCents: 0,
          taxCents: 1500,
          shippingCents: 5000,
          grandTotalCents: 36500,
        },
      }),
    };

    inventoryService = {
      reserveBatch: jest.fn().mockResolvedValue({ reservations: [] }),
      cancelReservationsBySession: jest.fn().mockResolvedValue(1),
    };

    orderNumberService = {
      generateOrderNumber: jest.fn().mockResolvedValue('SP-000001'),
    };

    taxConfig = {
      getRate: jest.fn().mockResolvedValue({ taxRatePercent: 5, hsnCode: '0910' }),
    };

    razorpayAdapter = {
      getKeyId: jest.fn().mockReturnValue('rzp_test_key'),
      createOrder: jest.fn().mockResolvedValue({ gatewayOrderId: 'order_rzp_123' }),
      verifyPaymentSignature: jest.fn(),
    };

    service = new CheckoutService(
      prisma as unknown as PrismaService,
      pricingService as unknown as PricingService,
      inventoryService as unknown as InventoryService,
      orderNumberService as unknown as OrderNumberService,
      razorpayAdapter as unknown as RazorpayAdapter,
      taxConfig as unknown as TaxConfigurationService,
    );
  });

  describe('Idempotency', () => {
    it('returns existing checkout intent when idempotencyKey was already processed for user', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        orderId: 'existing_order_1',
        amountCents: 36500,
        currency: 'INR',
        gateway: 'RAZORPAY',
        status: PaymentStatus.PENDING,
        gatewayOrderId: 'order_rzp_existing',
        order: {
          id: 'existing_order_1',
          orderNumber: 'SP-000001',
          userId,
        },
      });

      const result = await service.createCheckoutIntent(userId, {
        cartId,
        idempotencyKey: 'idem_key_1',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Temple St',
          city: 'Chennai',
          state: 'TN',
          stateCode: 'TN',
          postalCode: '600001',
          country: 'IN',
        },
      });

      expect(result.orderId).toBe('existing_order_1');
      expect(result.gatewayOrderId).toBe('order_rzp_existing');
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(inventoryService.reserveBatch).not.toHaveBeenCalled();
    });

    it('HIGH-05: allows safe retry when existing payment is in FAILED status, reusing existing order without duplicate order creation', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_failed_1',
        orderId: 'existing_failed_order',
        status: 'FAILED',
        amountCents: 36500,
        currency: 'INR',
        gatewayOrderId: 'pending_existing_failed_order',
        order: {
          id: 'existing_failed_order',
          orderNumber: 'SP-000001',
          userId,
          status: 'PAYMENT_FAILED',
        },
      });

      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [
          {
            variantId: 'var_1',
            quantity: 2,
            variant: {
              hsnCode: '0910',
              sku: 'PEPPER-100G',
              packType: 'Pouch',
              weightGrams: 100,
              priceCents: 15000,
              status: 'ACTIVE',
              product: { id: 'p1', name: 'Organic Pepper', status: 'ACTIVE' },
            },
          },
        ],
      });

      prisma.order.update.mockResolvedValue({
        id: 'existing_failed_order',
        orderNumber: 'SP-000001',
        status: 'PENDING_PAYMENT',
      });

      const result = await service.createCheckoutIntent(userId, {
        cartId,
        idempotencyKey: 'idem_failed_key',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Temple St',
          city: 'Chennai',
          state: 'TN',
          stateCode: 'TN',
          postalCode: '600001',
          country: 'IN',
        },
      });

      // Verifies HIGH-05: Reuses existing order ID and order number without creating duplicate order
      expect(result.orderId).toBe('existing_failed_order');
      expect(result.orderNumber).toBe('SP-000001');
      expect(result.gatewayOrderId).toBe('order_rzp_123');
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing_failed_order' },
          data: expect.objectContaining({ status: OrderStatus.PENDING_PAYMENT }),
        }),
      );
      // Re-reserves stock using existing session ID inside tx (MED-NEW-03)
      expect(inventoryService.reserveBatch).toHaveBeenCalledWith(
        expect.objectContaining({ checkoutSessionId: 'existing_failed_order' }),
        prisma,
      );
    });

    it('rejects with ConflictException if existing payment was REFUNDED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        orderId: 'refunded_order',
        status: 'REFUNDED',
        order: {
          id: 'refunded_order',
          userId,
        },
      });

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_refunded_key',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Temple St',
            city: 'Chennai',
            state: 'TN',
            stateCode: 'TN',
            postalCode: '600001',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects with ForbiddenException if idempotencyKey was used by a different user', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        orderId: 'other_order',
        order: {
          id: 'other_order',
          userId: 'other_user_id',
        },
      });

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_key_1',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Temple St',
            city: 'Chennai',
            state: 'TN',
            stateCode: 'TN',
            postalCode: '600001',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Validation & Authorization', () => {
    it('throws ForbiddenException if cart belongs to another user', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId: 'different_user',
        items: [{ id: 'item_1', variant: { status: 'ACTIVE', product: { status: 'ACTIVE' } } }],
      });

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_new',
          shippingAddress: {
            fullName: 'John',
            phone: '12345678',
            addressLine1: 'Street',
            city: 'City',
            state: 'State',
            stateCode: 'ST',
            postalCode: '1234',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if cart is empty', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [],
      });

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_new',
          shippingAddress: {
            fullName: 'John',
            phone: '12345678',
            addressLine1: 'Street',
            city: 'City',
            state: 'State',
            stateCode: 'ST',
            postalCode: '1234',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if any variant is inactive', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [
          {
            variantId: 'v_inactive',
            quantity: 1,
            variant: { status: 'DISCONTINUED', product: { name: 'Old Tea', status: 'ACTIVE' } },
          },
        ],
      });

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_new',
          shippingAddress: {
            fullName: 'John',
            phone: '12345678',
            addressLine1: 'Street',
            city: 'City',
            state: 'State',
            stateCode: 'ST',
            postalCode: '1234',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Happy Path & Transaction Boundaries', () => {
    it('creates Order and reservations inside DB transaction, then creates Razorpay order outside', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [
          {
            variantId: 'var_1',
            quantity: 2,
            variant: {
              hsnCode: '0910',
              sku: 'PEPPER-100G',
              packType: 'Pouch',
              weightGrams: 100,
              priceCents: 15000,
              status: 'ACTIVE',
              product: { id: 'p1', name: 'Organic Pepper', status: 'ACTIVE' },
            },
          },
        ],
      });

      prisma.order.create.mockImplementation(({ data }: any) => ({
        ...data,
      }));

      const result = await service.createCheckoutIntent(userId, {
        cartId,
        idempotencyKey: 'idem_happy',
        shippingAddress: {
          fullName: 'Sita Paati',
          phone: '+919876543210',
          addressLine1: '45 Agrahara St',
          city: 'Madurai',
          state: 'TN',
          stateCode: 'TN',
          postalCode: '625001',
          country: 'IN',
        },
      });

      // 1. Batch reservation called
      expect(inventoryService.reserveBatch).toHaveBeenCalledWith(
        {
          items: [{ variantId: 'var_1', quantity: 2 }],
          checkoutSessionId: expect.any(String),
        },
        expect.anything(),
      );

      // 2. Order created in PENDING_PAYMENT
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.PENDING_PAYMENT,
            subtotalCents: 30000,
            grandTotalCents: 36500,
          }),
        }),
      );

      // 3. Cart is retained until the authoritative payment-captured webhook.
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      const createdOrderData = prisma.order.create.mock.calls[0][0].data;
      expect(JSON.parse(createdOrderData.notes).cartId).toBe(cartId);

      // 4. Razorpay order created with auto-capture
      expect(razorpayAdapter.createOrder).toHaveBeenCalledWith({
        amountCents: 36500,
        currency: 'INR',
        receipt: 'SP-000001',
        notes: expect.any(Object),
      });

      // 5. Returned safe client data
      expect(result).toEqual({
        orderId: expect.any(String),
        orderNumber: 'SP-000001',
        amountCents: 36500,
        currency: 'INR',
        gateway: 'RAZORPAY',
        gatewayOrderId: 'order_rzp_123',
        gatewayKeyId: 'rzp_test_key',
      });
    });

    it('cancels reservations and throws BadGatewayException if Razorpay API fails outside transaction', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [
          {
            variantId: 'var_1',
            quantity: 1,
            variant: {
              hsnCode: '0910',
              sku: 'PEPPER-100G',
              packType: 'Pouch',
              weightGrams: 100,
              priceCents: 15000,
              status: 'ACTIVE',
              product: { id: 'p1', name: 'Organic Pepper', status: 'ACTIVE' },
            },
          },
        ],
      });

      prisma.order.create.mockImplementation(({ data }: any) => ({ ...data }));
      razorpayAdapter.createOrder.mockRejectedValue(new Error('Gateway timeout'));

      await expect(
        service.createCheckoutIntent(userId, {
          cartId,
          idempotencyKey: 'idem_fail',
          shippingAddress: {
            fullName: 'Sita',
            phone: '12345678',
            addressLine1: 'Street',
            city: 'City',
            state: 'TN',
            stateCode: 'TN',
            postalCode: '600001',
            country: 'IN',
          },
        }),
      ).rejects.toThrow(BadGatewayException);

      // Verification of recovery: reservations are released and cart is PRESERVED (HIGH-02)
      expect(inventoryService.cancelReservationsBySession).toHaveBeenCalled();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.PAYMENT_FAILED },
        }),
      );
    });

    it('MED-02: reconciles OrderItem tax distribution so sum of line taxes equals order.taxCents', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        userId,
        items: [
          {
            variantId: 'var_1',
            quantity: 1,
            variant: {
              hsnCode: '0910',
              sku: 'ITEM-1',
              packType: 'Pouch',
              weightGrams: 100,
              priceCents: 10000,
              status: 'ACTIVE',
              product: { id: 'p1', name: 'Item 1', status: 'ACTIVE' },
            },
          },
          {
            variantId: 'var_2',
            quantity: 1,
            variant: {
              hsnCode: '0910',
              sku: 'ITEM-2',
              packType: 'Pouch',
              weightGrams: 100,
              priceCents: 20000,
              status: 'ACTIVE',
              product: { id: 'p2', name: 'Item 2', status: 'ACTIVE' },
            },
          },
        ],
      });

      pricingService.calculate.mockReturnValue({
        lineItems: [
          { variantId: 'var_1', productName: 'Item 1', sku: 'ITEM-1', packType: 'Pouch', weightGrams: 100, quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000 },
          { variantId: 'var_2', productName: 'Item 2', sku: 'ITEM-2', packType: 'Pouch', weightGrams: 100, quantity: 1, unitPriceCents: 20000, lineTotalCents: 20000 },
        ],
        breakdown: {
          subtotalCents: 30000,
          couponDiscountCents: 3000,
          taxCents: 1350,
          shippingCents: 0,
          grandTotalCents: 28350,
        },
      });

      prisma.order.create.mockImplementation(({ data }: any) => ({ ...data }));

      await service.createCheckoutIntent(userId, {
        cartId,
        idempotencyKey: 'idem_tax_reconcile',
        shippingAddress: {
          fullName: 'John',
          phone: '12345678',
          addressLine1: 'Street',
          city: 'City',
          state: 'State',
          stateCode: 'ST',
          postalCode: '1234',
          country: 'IN',
        },
      });

      expect(prisma.orderItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ variantId: 'var_1', taxCents: expect.any(Number) }),
          expect.objectContaining({ variantId: 'var_2', taxCents: expect.any(Number) }),
        ]),
      });

      const createManyArg = prisma.orderItem.createMany.mock.calls[0][0];
      const items = createManyArg.data;
      const sumOfTaxes = items.reduce((sum: number, it: any) => sum + it.taxCents, 0);
      expect(sumOfTaxes).toBe(1350);
    });
  });

  describe('verifyPayment', () => {
    it('returns verified: true when client signature matches', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order_1',
        orderNumber: 'SP-000001',
        userId,
        status: OrderStatus.PENDING_PAYMENT,
      });

      razorpayAdapter.verifyPaymentSignature.mockReturnValue(true);

      const res = await service.verifyPayment(userId, {
        orderId: 'order_1',
        razorpay_order_id: 'rzp_o1',
        razorpay_payment_id: 'rzp_p1',
        razorpay_signature: 'valid_sig',
      });

      expect(res.verified).toBe(true);
      expect(res.status).toBe(OrderStatus.PENDING_PAYMENT); // Remains PENDING_PAYMENT until webhook confirms!
    });

    it('rejects verifyPayment if user does not own the order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order_1',
        userId: 'other_user',
      });

      await expect(
        service.verifyPayment(userId, {
          orderId: 'order_1',
          razorpay_order_id: 'rzp_o1',
          razorpay_payment_id: 'rzp_p1',
          razorpay_signature: 'sig',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
