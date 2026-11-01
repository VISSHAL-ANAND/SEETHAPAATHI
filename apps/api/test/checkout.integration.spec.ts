import { PrismaService } from '../src/modules/prisma/prisma.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { CartService } from '../src/modules/cart/cart.service';
import { OrderNumberService } from '../src/modules/checkout/order-number.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { WebhookService } from '../src/modules/payments/webhook.service';
import { RazorpayAdapter } from '../src/modules/payments/razorpay.adapter';
import { OrdersService } from '../src/modules/orders/orders.service';
import { TaxConfigurationService } from '../src/modules/invoicing/tax-configuration.service';
import { OutboxService } from '../src/modules/invoicing/outbox.service';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { ConfigService } from '@nestjs/config';
import { DiscountType, OrderStatus } from '@prisma/client';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Phase 3 End-to-End Checkout & Payment Integration Test (PostgreSQL)', () => {
  let prisma: PrismaService;
  let inventoryService: InventoryService;
  let pricingService: PricingService;
  let cartService: CartService;
  let orderNumberService: OrderNumberService;
  let razorpayAdapter: RazorpayAdapter;
  let checkoutService: CheckoutService;
  let paymentsService: PaymentsService;
  let webhookService: WebhookService;
  let ordersService: OrdersService;
  let taxConfig: TaxConfigurationService;
  let notificationService: NotificationService;

  const testSuffix = Date.now().toString().slice(-6);
  let userId: string;
  let categoryId: string;
  let productId: string;
  let variantId: string;
  let cartId: string;
  let orderId: string;
  const webhookSecret = 'test_integration_webhook_secret';

  const orderIds: string[] = [];
  const cartIds: string[] = [];
  const variantIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const userIds: string[] = [];
  const couponCodes: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const configService = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_key_integration';
        if (key === 'RAZORPAY_KEY_SECRET') return 'rzp_test_secret_integration';
        if (key === 'RAZORPAY_WEBHOOK_SECRET') return webhookSecret;
        if (key === 'RESERVATION_TTL_MINUTES') return 15;
        return def;
      }),
    } as unknown as ConfigService;

    inventoryService = new InventoryService(prisma, configService);
    pricingService = new PricingService();
    taxConfig = new TaxConfigurationService(prisma, configService);
    await prisma.taxRate.upsert({ where: { hsnCode: '0910' }, update: { taxRatePercent: 5, isActive: true }, create: { id: `test-tax-0910-${testSuffix}`, hsnCode: '0910', description: 'Test tax rate', taxRatePercent: 5, isActive: true } });
    cartService = new CartService(prisma, pricingService, taxConfig);
    orderNumberService = new OrderNumberService(prisma);

    razorpayAdapter = new RazorpayAdapter(configService);
    // Mock only the external HTTP call to Razorpay
    jest.spyOn(razorpayAdapter, 'createOrder').mockImplementation(async (params) => ({
      gatewayOrderId: `rzp_order_${testSuffix}`,
      gateway: 'RAZORPAY',
      amountCents: params.amountCents,
      currency: params.currency,
    }));

    paymentsService = new PaymentsService(prisma);
    checkoutService = new CheckoutService(
      prisma,
      pricingService,
      inventoryService,
      orderNumberService,
      razorpayAdapter,
      taxConfig,
    );

    notificationService = {
      enqueueOrderStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationService;

    webhookService = new WebhookService(
      prisma,
      razorpayAdapter,
      inventoryService,
      paymentsService,
      new OutboxService(prisma),
      notificationService,
    );

    ordersService = new OrdersService(prisma, inventoryService, notificationService);

    // Seed test user
    const user = await prisma.user.create({
      data: {
        email: `customer_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash_for_integration',
        fullName: 'Test Customer',
      },
    });
    userId = user.id;
    userIds.push(userId);

    // Seed category, product, variant with 10 available units
    const category = await prisma.category.create({
      data: {
        name: `Masala Category ${testSuffix}`,
        slug: `masala-cat-${testSuffix}`,
      },
    });
    categoryId = category.id;
    categoryIds.push(categoryId);

    const product = await prisma.product.create({
      data: {
        name: `Chettinad Masala ${testSuffix}`,
        slug: `chettinad-masala-${testSuffix}`,
        description: 'Authentic stone ground masala',
        categoryId,
        status: 'ACTIVE',
      },
    });
    productId = product.id;
    productIds.push(productId);

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `MASALA-CHET-${testSuffix}`,
        hsnCode: '0910',
        priceCents: 15000, // ₹150
        weightGrams: 200,
        packType: 'Glass Jar',
        status: 'ACTIVE',
        inventory: {
          create: {
            quantityAvailable: 10,
            quantityReserved: 0,
            reorderThreshold: 2,
          },
        },
      },
    });
    variantId = variant.id;
    variantIds.push(variantId);

    // Create user cart and add 2 units
    cartId = await cartService.getOrCreateCart(userId);
    cartIds.push(cartId);
    await cartService.addItem(cartId, { variantId, quantity: 2 });
  });

  afterAll(async () => {
    // Clean up created entities in reverse dependency order
    if (orderIds.length > 0) {
      await prisma.paymentTransaction.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.inventoryReservation.deleteMany({ where: { checkoutSessionId: { in: orderIds } } });
      await prisma.couponUsage.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (couponCodes.length > 0) {
      await prisma.coupon.deleteMany({ where: { code: { in: couponCodes } } });
    }
    if (cartIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
    if (variantIds.length > 0) {
      await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.inventoryReservation.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    }
    if (productIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (categoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('executes atomic checkout: reserves stock, creates order, and prepares payment', async () => {
    const idempotencyKey = `idem_int_${testSuffix}`;

    const intent = await checkoutService.createCheckoutIntent(userId, {
      cartId,
      idempotencyKey,
      shippingAddress: {
        fullName: 'Sita Paati',
        phone: '+919876543210',
        addressLine1: '12 Temple Lane',
        city: 'Madurai',
        state: 'Tamil Nadu',
        stateCode: 'TN',
        postalCode: '625001',
        country: 'IN',
      },
    });

    orderId = intent.orderId;
    orderIds.push(orderId);
    expect(intent.orderId).toBeDefined();
    expect(intent.orderNumber).toMatch(/^SP-\d{6}$/);
    expect(intent.gateway).toBe('RAZORPAY');
    expect(intent.gatewayOrderId).toBe(`rzp_order_${testSuffix}`);

    // Verify database state in PostgreSQL
    const dbOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });

    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(dbOrder!.items).toHaveLength(1);
    expect(dbOrder!.items[0].skuSnapshot).toBe(`MASALA-CHET-${testSuffix}`);
    expect(dbOrder!.items[0].quantity).toBe(2);

    // Verify stock reserved in PostgreSQL
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv!.quantityAvailable).toBe(10);
    expect(inv!.quantityReserved).toBe(2); // 2 units reserved!

    // Verify active reservation record exists in PostgreSQL
    const reservations = await prisma.inventoryReservation.findMany({
      where: { checkoutSessionId: orderId },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe('ACTIVE');
    expect(reservations[0].quantity).toBe(2);
  });

  it('authoritatively finalizes order and commits stock when payment.captured webhook arrives', async () => {
    // Generate valid HMAC signature for webhook payload
    const webhookPayload = {
      event: 'payment.captured',
      id: `evt_int_${testSuffix}`,
      payload: {
        payment: {
          entity: {
            id: `pay_rzp_${testSuffix}`,
            order_id: `rzp_order_${testSuffix}`,
            amount: 36500, // ₹300 subtotal + ₹15 tax + ₹50 shipping
            currency: 'INR',
          },
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const result = await webhookService.processRazorpayWebhook(
      rawBody,
      signature,
      `evt_int_${testSuffix}`,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(OrderStatus.PAID);

    // Verify Order is now PAID in PostgreSQL
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.PAID);

    // Verify stock reservation was committed: quantityAvailable decreased from 10 to 8!
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv!.quantityAvailable).toBe(8);
    expect(inv!.quantityReserved).toBe(0);

    // Verify reservation status in PostgreSQL is COMMITTED
    const reservation = await prisma.inventoryReservation.findFirst({
      where: { checkoutSessionId: orderId },
    });
    expect(reservation!.status).toBe('COMMITTED');

    // Verify OrderStatusHistory audit entry
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    expect(history[0].newStatus).toBe(OrderStatus.PAID);
    expect(history[0].reason).toBe('PAYMENT_CAPTURED_WEBHOOK');
  });

  it('safely ignores duplicate webhook delivery with zero extra inventory adjustment', async () => {
    const webhookPayload = {
      event: 'payment.captured',
      id: `evt_int_${testSuffix}`,
      payload: {
        payment: {
          entity: {
            id: `pay_rzp_${testSuffix}`,
            order_id: `rzp_order_${testSuffix}`,
            amount: 36500,
            currency: 'INR',
          },
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Replay identical webhook event
    const result = await webhookService.processRazorpayWebhook(
      rawBody,
      signature,
      `evt_int_${testSuffix}`,
    );

    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);

    // Inventory must remain exactly 8 available, 0 reserved
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv!.quantityAvailable).toBe(8);
    expect(inv!.quantityReserved).toBe(0);
  });

  it('HIGH-05: handles transient payment gateway failure and safely allows idempotency retry', async () => {
    // 1. Create a fresh variant with 5 units
    const retryVariant = await prisma.productVariant.create({
      data: {
        productId,
        hsnCode: '0910',
        sku: `RETRY-SKU-${testSuffix}`,
        priceCents: 20000,
        weightGrams: 250,
        packType: 'Pouch',
        status: 'ACTIVE',
        inventory: {
          create: {
            quantityAvailable: 5,
            quantityReserved: 0,
            reorderThreshold: 1,
          },
        },
      },
    });
    variantIds.push(retryVariant.id);

    // 2. Create user cart and add item
    const retryUser = await prisma.user.create({
      data: {
        email: `retry_user_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash',
        fullName: 'Retry Test User',
      },
    });
    userIds.push(retryUser.id);

    const retryCartId = await cartService.getOrCreateCart(retryUser.id);
    cartIds.push(retryCartId);
    await cartService.addItem(retryCartId, { variantId: retryVariant.id, quantity: 1 });

    const retryIdempotencyKey = `idem_retry_${testSuffix}`;

    // 3. Simulate transient Razorpay 504 Gateway Timeout on first attempt
    jest.spyOn(razorpayAdapter, 'createOrder').mockRejectedValueOnce(new Error('Gateway Timeout 504'));

    await expect(
      checkoutService.createCheckoutIntent(retryUser.id, {
        cartId: retryCartId,
        idempotencyKey: retryIdempotencyKey,
        shippingAddress: {
          fullName: 'Retry Customer',
          phone: '+919876543210',
          addressLine1: '45 South St',
          city: 'Madurai',
          state: 'Tamil Nadu',
        stateCode: 'TN',
          postalCode: '625001',
          country: 'IN',
        },
      }),
    ).rejects.toThrow(BadGatewayException);

    // Verify cart was PRESERVED (not deleted)
    const cartAfterFail = await prisma.cart.findUnique({
      where: { id: retryCartId },
      include: { items: true },
    });
    expect(cartAfterFail!.items).toHaveLength(1);

    // Verify order exists with status PAYMENT_FAILED
    const failedPayment = await prisma.payment.findUnique({
      where: { idempotencyKey: retryIdempotencyKey },
      include: { order: true },
    });
    expect(failedPayment).not.toBeNull();
    expect(failedPayment!.status).toBe('FAILED');
    expect(failedPayment!.order.status).toBe('PAYMENT_FAILED');
    const originalOrderId = failedPayment!.order.id;
    const originalOrderNumber = failedPayment!.order.orderNumber;
    orderIds.push(originalOrderId);

    // Verify reservations were released: quantityReserved is 0, active reservation count is 0
    const invAfterFail = await prisma.inventory.findUnique({ where: { variantId: retryVariant.id } });
    expect(invAfterFail!.quantityReserved).toBe(0);
    const activeResAfterFail = await prisma.inventoryReservation.findMany({
      where: { checkoutSessionId: originalOrderId, status: 'ACTIVE' },
    });
    expect(activeResAfterFail).toHaveLength(0);

    // 4. Second attempt with the SAME idempotency key (mock succeeds)
    jest.spyOn(razorpayAdapter, 'createOrder').mockResolvedValueOnce({
      gatewayOrderId: `rzp_order_retry_${testSuffix}`,
      gateway: 'RAZORPAY',
      amountCents: 26000,
      currency: 'INR',
    });

    const retryIntent = await checkoutService.createCheckoutIntent(retryUser.id, {
      cartId: retryCartId,
      idempotencyKey: retryIdempotencyKey,
      shippingAddress: {
        fullName: 'Retry Customer',
        phone: '+919876543210',
        addressLine1: '45 South St',
        city: 'Madurai',
        state: 'Tamil Nadu',
        stateCode: 'TN',
        postalCode: '625001',
        country: 'IN',
      },
    });

    // Verify intent reuses the exact same orderId and orderNumber
    expect(retryIntent.orderId).toBe(originalOrderId);
    expect(retryIntent.orderNumber).toBe(originalOrderNumber);
    expect(retryIntent.gatewayOrderId).toBe(`rzp_order_retry_${testSuffix}`);

    // Verify order in DB updated to PENDING_PAYMENT
    const retriedOrder = await prisma.order.findUnique({
      where: { id: originalOrderId },
      include: { payments: true, items: true },
    });
    expect(retriedOrder!.status).toBe('PENDING_PAYMENT');
    expect(retriedOrder!.payments[0].status).toBe('PENDING');
    expect(retriedOrder!.payments[0].gatewayOrderId).toBe(`rzp_order_retry_${testSuffix}`);
    expect(retriedOrder!.items).toHaveLength(1);

    // Verify inventory reservation was re-acquired
    const invAfterRetry = await prisma.inventory.findUnique({ where: { variantId: retryVariant.id } });
    expect(invAfterRetry!.quantityReserved).toBe(1);

    // The gateway order is only an intent; retain cart contents until the
    // authoritative payment-captured webhook removes purchased quantities.
    const cartAfterGatewayIntent = await prisma.cart.findUnique({
      where: { id: retryCartId },
      include: { items: true },
    });
    expect(cartAfterGatewayIntent!.items).toHaveLength(1);
  });

  it('MED-NEW-01: enforces strict coupon usage limits under concurrent checkouts via row lock', async () => {
    // 1. Create a coupon with usageLimit = 1
    const couponCode = `LIMIT1_${testSuffix}`;
    await prisma.coupon.create({
      data: {
        code: couponCode,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        minOrderCents: 1000,
        usageLimit: 1,
        usageCount: 0,
        isActive: true,
      },
    });
    couponCodes.push(couponCode);

    // 2. Create variant with plenty of stock
    const couponVariant = await prisma.productVariant.create({
      data: {
        productId,
        hsnCode: '0910',
        sku: `COUPON-SKU-${testSuffix}`,
        priceCents: 30000,
        weightGrams: 500,
        packType: 'Tin',
        status: 'ACTIVE',
        inventory: {
          create: {
            quantityAvailable: 100,
            quantityReserved: 0,
            reorderThreshold: 5,
          },
        },
      },
    });
    variantIds.push(couponVariant.id);

    // 3. Create two distinct users and carts
    const userA = await prisma.user.create({
      data: {
        email: `usera_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash',
        fullName: 'User A',
      },
    });
    userIds.push(userA.id);
    const cartA = await cartService.getOrCreateCart(userA.id);
    cartIds.push(cartA);
    await cartService.addItem(cartA, { variantId: couponVariant.id, quantity: 1 });

    const userB = await prisma.user.create({
      data: {
        email: `userb_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash',
        fullName: 'User B',
      },
    });
    userIds.push(userB.id);
    const cartB = await cartService.getOrCreateCart(userB.id);
    cartIds.push(cartB);
    await cartService.addItem(cartB, { variantId: couponVariant.id, quantity: 1 });

    jest.spyOn(razorpayAdapter, 'createOrder').mockImplementation(async (params) => ({
      gatewayOrderId: `rzp_coupon_${crypto.randomUUID()}`,
      gateway: 'RAZORPAY',
      amountCents: params.amountCents,
      currency: params.currency,
    }));

    const shippingAddress = {
      fullName: 'Coupon User',
      phone: '+919876543210',
      addressLine1: '100 Bazar St',
      city: 'Madurai',
      state: 'Tamil Nadu',
        stateCode: 'TN',
      postalCode: '625001',
      country: 'IN',
    };

    // 4. Concurrently trigger checkout intent with the coupon for both users
    const results = await Promise.allSettled([
      checkoutService.createCheckoutIntent(userA.id, {
        cartId: cartA,
        idempotencyKey: `idem_coupon_a_${testSuffix}`,
        couponCode,
        shippingAddress,
      }),
      checkoutService.createCheckoutIntent(userB.id, {
        cartId: cartB,
        idempotencyKey: `idem_coupon_b_${testSuffix}`,
        couponCode,
        shippingAddress,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // Exactly one checkout must succeed and exactly one must fail
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The successful checkout created an order
    orderIds.push(fulfilled[0].value.orderId);

    // The rejected checkout threw BadRequestException for INVALID_COUPON (Coupon usage limit reached)
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(rejected[0].reason.getResponse()).toMatchObject({
      error: 'INVALID_COUPON',
      message: 'Coupon usage limit reached',
    });
  });

  it('MED-NEW-03: rolls back inventory reservations atomically when outer checkout transaction fails', async () => {
    // 1. Create a variant with 10 units
    const rollbackVariant = await prisma.productVariant.create({
      data: {
        productId,
        hsnCode: '0910',
        sku: `ROLLBACK-SKU-${testSuffix}`,
        priceCents: 10000,
        weightGrams: 100,
        packType: 'Pouch',
        status: 'ACTIVE',
        inventory: {
          create: {
            quantityAvailable: 10,
            quantityReserved: 0,
            reorderThreshold: 1,
          },
        },
      },
    });
    variantIds.push(rollbackVariant.id);

    const rollbackUser = await prisma.user.create({
      data: {
        email: `rollback_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash',
        fullName: 'Rollback User',
      },
    });
    userIds.push(rollbackUser.id);

    const rollbackCartId = await cartService.getOrCreateCart(rollbackUser.id);
    cartIds.push(rollbackCartId);
    await cartService.addItem(rollbackCartId, { variantId: rollbackVariant.id, quantity: 3 });

    // Mock orderNumberService to throw an error inside the transaction, AFTER reserveBatch
    jest.spyOn(orderNumberService, 'generateOrderNumber').mockRejectedValueOnce(
      new Error('Simulated DB failure after reserveBatch'),
    );

    await expect(
      checkoutService.createCheckoutIntent(rollbackUser.id, {
        cartId: rollbackCartId,
        idempotencyKey: `idem_rollback_${testSuffix}`,
        shippingAddress: {
          fullName: 'Rollback Customer',
          phone: '+919876543210',
          addressLine1: '12 Temple Lane',
          city: 'Madurai',
          state: 'Tamil Nadu',
        stateCode: 'TN',
          postalCode: '625001',
          country: 'IN',
        },
      }),
    ).rejects.toThrow('Simulated DB failure after reserveBatch');

    // Verify inventory reserved is ZERO in PostgreSQL because the transaction rolled back atomically
    const inv = await prisma.inventory.findUnique({ where: { variantId: rollbackVariant.id } });
    expect(inv!.quantityReserved).toBe(0);
    expect(inv!.quantityAvailable).toBe(10);

    // Verify no orphaned active reservations exist
    const reservations = await prisma.inventoryReservation.findMany({
      where: { variantId: rollbackVariant.id },
    });
    expect(reservations).toHaveLength(0);
  });

  it('MED-NEW-02: OrdersService.cancelOrder releases reservations atomically within transaction', async () => {
    // 1. Create a variant with 10 units
    const cancelVariant = await prisma.productVariant.create({
      data: {
        productId,
        hsnCode: '0910',
        sku: `CANCEL-SKU-${testSuffix}`,
        priceCents: 12000,
        weightGrams: 100,
        packType: 'Pouch',
        status: 'ACTIVE',
        inventory: {
          create: {
            quantityAvailable: 10,
            quantityReserved: 0,
            reorderThreshold: 1,
          },
        },
      },
    });
    variantIds.push(cancelVariant.id);

    const cancelUser = await prisma.user.create({
      data: {
        email: `cancel_user_${testSuffix}@seethapaati.test`,
        passwordHash: 'dummy_hash',
        fullName: 'Cancel User',
      },
    });
    userIds.push(cancelUser.id);

    const cancelCartId = await cartService.getOrCreateCart(cancelUser.id);
    cartIds.push(cancelCartId);
    await cartService.addItem(cancelCartId, { variantId: cancelVariant.id, quantity: 2 });

    jest.spyOn(razorpayAdapter, 'createOrder').mockResolvedValueOnce({
      gatewayOrderId: `rzp_cancel_${testSuffix}`,
      gateway: 'RAZORPAY',
      amountCents: 24000,
      currency: 'INR',
    });

    const intent = await checkoutService.createCheckoutIntent(cancelUser.id, {
      cartId: cancelCartId,
      idempotencyKey: `idem_cancel_${testSuffix}`,
      shippingAddress: {
        fullName: 'Cancel Customer',
        phone: '+919876543210',
        addressLine1: '12 Temple Lane',
        city: 'Madurai',
        state: 'Tamil Nadu',
        stateCode: 'TN',
        postalCode: '625001',
        country: 'IN',
      },
    });
    orderIds.push(intent.orderId);

    // Verify reserved quantity is 2
    let inv = await prisma.inventory.findUnique({ where: { variantId: cancelVariant.id } });
    expect(inv!.quantityReserved).toBe(2);

    // 2. Customer cancels order
    const cancelledOrder = await ordersService.cancelOrder(intent.orderId, cancelUser.id, 'Changed mind');
    expect(cancelledOrder.status).toBe('CANCELLED');

    // 3. Verify stock reservation was released inside transaction
    inv = await prisma.inventory.findUnique({ where: { variantId: cancelVariant.id } });
    expect(inv!.quantityReserved).toBe(0);

    const res = await prisma.inventoryReservation.findFirst({
      where: { checkoutSessionId: intent.orderId },
    });
    expect(res!.status).toBe('CANCELLED');
  });
});
