import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrderListQuery, UpdateOrderStatusRequest } from '@seethapaati/contracts';
import { NotificationService } from '../notifications/notification.service';

/**
 * Valid order state machine transitions.
 */
const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_FAILED]: [OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURNED],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

const SHIPPED_STATUSES: OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.IN_TRANSIT,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/**
 * ORDERS SERVICE
 *
 * Manages order queries, detail lookups, status transitions, and customer cancellations.
 * Strictly enforces IDOR protection and the state machine.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Get paginated orders for a specific authenticated customer.
   */
  async getOrdersForUser(userId: string, query: OrderListQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: {
            select: {
              id: true,
              gateway: true,
              amountCents: true,
              currency: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all orders across the store (Staff / Admin with ORDERS_READ_ALL).
   */
  async getAllOrders(query: OrderListQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          items: true,
          payments: {
            select: {
              id: true,
              gateway: true,
              amountCents: true,
              currency: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get order details by ID.
   * IDOR protection: non-staff users can ONLY access their own orders.
   */
  async getOrderById(orderId: string, userId: string, hasReadAllPermission: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    if (!hasReadAllPermission && order.userId !== userId) {
      throw new ForbiddenException({
        error: 'ORDER_FORBIDDEN',
        message: 'You do not have permission to view this order',
      });
    }

    return order;
  }

  /**
   * Update order status (Staff / Admin).
   * Enforces valid state machine transitions and audit history.
   */
  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusRequest,
    changedBy: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const targetStatus = dto.status as unknown as OrderStatus;
    if (order.status === targetStatus) {
      return order; // Idempotent no-op
    }

    if (targetStatus === OrderStatus.CANCELLED && SHIPPED_STATUSES.includes(order.status)) {
      throw new BadRequestException({
        message: 'Orders that have already been shipped cannot be cancelled directly. Please initiate a return upon delivery.',
      });
    }

    const allowed = VALID_ORDER_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException({
        error: 'INVALID_ORDER_TRANSITION',
        message: `Cannot transition order from ${order.status} to ${targetStatus}`,
      });
    }

    return await this.prisma.$transaction(async (tx) => {
      // If transition is to CANCELLED and was PENDING_PAYMENT, release stock reservations
      if (targetStatus === OrderStatus.CANCELLED && order.status === OrderStatus.PENDING_PAYMENT) {
        await this.inventoryService.cancelReservationsBySession(orderId, tx);
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: targetStatus,
          reason: dto.reason || 'STATUS_UPDATED_BY_STAFF',
          changedBy,
        },
      });

      await this.notificationService.enqueueOrderStatus(orderId, targetStatus, tx);

      this.logger.log(`Order ${orderId} transitioned: ${order.status} -> ${dto.status} by ${changedBy}`);
      return updated;
    });
  }

  /**
   * Cancel order by customer.
   * Allowed ONLY if order is in PENDING_PAYMENT, PAID, or PROCESSING state.
   */
  async cancelOrder(orderId: string, userId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    if (order.userId !== userId) {
      throw new ForbiddenException({ error: 'ORDER_FORBIDDEN', message: 'Access denied' });
    }

    if (SHIPPED_STATUSES.includes(order.status)) {
      throw new BadRequestException({
        message: 'Orders that have already been shipped cannot be cancelled directly. Please initiate a return upon delivery.',
      });
    }

    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException({
        error: 'ORDER_CANNOT_BE_CANCELLED',
        message: `Order in state '${order.status}' cannot be cancelled by customer`,
      });
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Release active reservations inside transaction
      await this.inventoryService.cancelReservationsBySession(orderId, tx);

      // 2. Mark order as CANCELLED
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      // 3. Record history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.CANCELLED,
          reason: reason || 'CANCELLED_BY_CUSTOMER',
          changedBy: userId,
        },
      });

      this.logger.log(`Order ${orderId} cancelled by customer ${userId}`);
      return updated;
    });
  }
}
