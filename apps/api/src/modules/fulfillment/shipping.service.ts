import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationService } from '../notifications/notification.service';

const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ['AWB_ASSIGNED', 'SHIPPED', 'CANCELLED'],
  AWB_ASSIGNED: ['SHIPPED', 'IN_TRANSIT', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const INDIA_POST_TRACKING_URL =
  'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx';

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export interface TrackingCheckpoint {
  key: 'ORDERED' | 'PAID' | 'PACKED' | 'SHIPPED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  label: string;
  completed: boolean;
  active: boolean;
  timestamp?: string | null;
  description?: string | null;
  location?: string | null;
}

export interface IndiaPostServiceabilityResult {
  serviceable: boolean;
  carrier: string;
  estimatedDays: string;
  pincode?: string;
  message?: string;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Helper method to generate the public India Post consignment tracking link
   */
  getIndiaPostTrackingUrl(trackingNumber?: string): string {
    return INDIA_POST_TRACKING_URL;
  }

  /**
   * 1. Admin Order Fulfillment via India Post (Speed Post / Registered Parcel)
   * Updates order status to SHIPPED, stores trackingNumber, sets shippedAt,
   * generates India Post consignment tracking URL, and notifies customer.
   */
  async fulfillOrder(orderId: string, trackingNumber: string, adminId = 'ADMIN') {
    const trimmedTracking = trackingNumber?.trim();
    if (!trimmedTracking || trimmedTracking.length < 3) {
      throw new BadRequestException({
        error: 'INVALID_TRACKING_NUMBER',
        message: 'A valid India Post consignment/tracking number is required',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent dispatch requests for the same order.
      const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
      `;
      if (lockedOrders.length === 0) {
        throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }

      // PACKED is the only valid predecessor of SHIPPED in the order state machine.
      const shippableStatuses: OrderStatus[] = [OrderStatus.PACKED];
      if (!shippableStatuses.includes(order.status)) {
        throw new BadRequestException({
          error: 'ORDER_NOT_SHIPPABLE',
          message: `Order in status ${order.status} cannot be dispatched.`,
        });
      }

      const now = new Date();
      const trackingUrl = this.getIndiaPostTrackingUrl(trimmedTracking);
      const courierPartner = 'India Post';

      // 1. Create or Update Shipment
      const existingShipment = await tx.shipment.findUnique({ where: { orderId } });
      let shipment;

      if (existingShipment) {
        shipment = await tx.shipment.update({
          where: { orderId },
          data: {
            carrier: courierPartner,
            trackingNumber: trimmedTracking,
            trackingUrl,
            status: ShipmentStatus.SHIPPED,
            dispatchedAt: existingShipment.dispatchedAt || now,
          },
        });
      } else {
        shipment = await tx.shipment.create({
          data: {
            orderId,
            carrier: courierPartner,
            trackingNumber: trimmedTracking,
            trackingUrl,
            status: ShipmentStatus.SHIPPED,
            dispatchedAt: now,
          },
        });
      }

      // 2. Add Tracking Event
      await tx.shipmentTrackingEvent.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.SHIPPED,
          description: `Consignment booked with India Post Speed Post. Tracking No: ${trimmedTracking}`,
        },
      });

      // 3. Update Order status and tracking columns
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.SHIPPED,
          courierPartner,
          trackingNumber: trimmedTracking,
          trackingUrl,
          shippedAt: order.shippedAt || now,
        },
      });

      // 4. Record in OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.SHIPPED,
          reason: `Dispatched via India Post Speed Post (Consignment No: ${trimmedTracking})`,
          changedBy: adminId,
        },
      });

      // 5. Enqueue Customer Notification
      await this.notifications.enqueueShipmentStatus(orderId, shipment.id, ShipmentStatus.SHIPPED, tx);

      this.logger.log(`Order ${order.orderNumber} fulfilled via India Post (${trimmedTracking})`);
      return { order: updatedOrder, shipment, trackingUrl };
    });
  }

  /**
   * Compatibility wrapper for manual tracking requests
   */
  async updateManualTracking(
    orderId: string,
    courierName: string,
    trackingNumber: string,
    trackingUrl?: string,
    adminId = 'ADMIN',
  ) {
    if (!/^india post(?: speed post)?$/i.test((courierName || '').trim())) {
      throw new BadRequestException({
        error: 'UNSUPPORTED_COURIER',
        message: 'This deployment currently supports India Post tracking only.',
      });
    }
    // India Post tracking URLs are generated from the consignment number;
    // do not accept an arbitrary caller-supplied URL.
    void trackingUrl;
    return this.fulfillOrder(orderId, trackingNumber, adminId);
  }

  /**
   * 2. Pincode Serviceability Check.
   * PIN format validation is not proof that a specific destination is serviceable.
   * Until a live India Post serviceability source is configured, fail closed rather
   * than promise delivery or an estimated transit time.
   */
  async checkServiceability(pincode: string): Promise<IndiaPostServiceabilityResult> {
    const trimmedPincode = (pincode || '').trim();

    if (!PINCODE_REGEX.test(trimmedPincode)) {
      throw new BadRequestException({
        error: 'INVALID_PINCODE',
        message: 'Must be a valid 6-digit Indian postal PIN code (e.g., 600004)',
      });
    }

    return {
      serviceable: false,
      carrier: 'India Post Speed Post',
      estimatedDays: 'Unverified',
      pincode: trimmedPincode,
      message: 'Delivery serviceability is not currently verified for this PIN code.',
    };
  }

  /**
   * 3. Customer & Staff Order Tracking
   */
  async track(orderId: string, userId?: string, readAll = false) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        items: true,
      },
    });

    if (!order) throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (userId && !readAll && order.userId !== userId) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { trackingEvents: { orderBy: { occurredAt: 'asc' } } },
    });

    const checkpoints = this.buildTrackingTimeline(order, shipment);
    const trackingNumber = order.trackingNumber || shipment?.trackingNumber || null;
    const trackingUrl = trackingNumber
      ? this.getIndiaPostTrackingUrl(trackingNumber)
      : order.trackingUrl || shipment?.trackingUrl || null;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      courierPartner: order.courierPartner || 'India Post',
      courierName: order.courierPartner || 'India Post',
      trackingNumber,
      trackingUrl,
      createdAt: order.createdAt,
      shippedAt: order.shippedAt || shipment?.dispatchedAt || null,
      deliveredAt: order.deliveredAt || shipment?.deliveredAt || null,
      shipment: shipment || null,
      checkpoints,
    };
  }

  /**
   * Create standard shipment without immediately dispatching
   */
  async create(orderId: string, carrier = 'India Post', trackingNumber?: string, trackingUrl?: string) {
    if (!/^india post(?: speed post)?$/i.test((carrier || '').trim())) {
      throw new BadRequestException({
        error: 'UNSUPPORTED_COURIER',
        message: 'This deployment currently supports India Post tracking only.',
      });
    }
    // Always generate the official tracking URL from the consignment number.
    void trackingUrl;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException({ error: 'ORDER_NOT_FOUND' });

      if (
        order.status !== OrderStatus.PACKED
      ) {
        throw new BadRequestException({
          error: 'ORDER_NOT_SHIPPABLE',
          message: `Order in status ${order.status} cannot be shipped.`,
        });
      }

      const existing = await tx.shipment.findUnique({ where: { orderId } });
      if (existing) return existing;

      const status = trackingNumber ? ShipmentStatus.AWB_ASSIGNED : ShipmentStatus.CREATED;
      const finalTrackingUrl = trackingNumber ? this.getIndiaPostTrackingUrl(trackingNumber) : undefined;

      return tx.shipment.create({
        data: {
          orderId,
          carrier,
          trackingNumber,
          trackingUrl: finalTrackingUrl,
          status,
          trackingEvents: {
            create: {
              status,
              description: trackingNumber
                ? `Consignment ${trackingNumber} assigned via ${carrier}`
                : 'Shipment manifest prepared for India Post dispatch',
            },
          },
        },
        include: { trackingEvents: true },
      });
    });
  }

  /**
   * Transition shipment event (e.g. from post office updates)
   */
  async addEvent(shipmentId: string, status: ShipmentStatus, location?: string, description?: string) {
    return this.prisma.$transaction(async (tx) => {
      const [s] = await tx.$queryRaw<
        Array<{
          id: string;
          orderId: string;
          status: ShipmentStatus;
          carrier: string;
          trackingNumber: string | null;
          trackingUrl: string | null;
          dispatchedAt: Date | null;
          deliveredAt: Date | null;
        }>
      >`
        SELECT id, order_id AS "orderId", status, carrier, tracking_number AS "trackingNumber", tracking_url AS "trackingUrl", dispatched_at AS "dispatchedAt", delivered_at AS "deliveredAt"
        FROM shipments WHERE id=${shipmentId} FOR UPDATE
      `;

      if (!s) throw new NotFoundException({ error: 'SHIPMENT_NOT_FOUND' });
      if (!transitions[s.status].includes(status)) {
        throw new BadRequestException({
          error: 'INVALID_SHIPMENT_TRANSITION',
          message: `Cannot transition shipment from ${s.status} to ${status}`,
        });
      }

      const now = new Date();
      const shipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status,
          dispatchedAt: status === ShipmentStatus.SHIPPED ? now : s.dispatchedAt,
          deliveredAt: status === ShipmentStatus.DELIVERED ? now : s.deliveredAt,
        },
      });

      await tx.shipmentTrackingEvent.create({
        data: { shipmentId, status, location, description },
      });

      await this.notifications.enqueueShipmentStatus(s.orderId, shipmentId, status, tx);

      // Synchronize Order status
      const mappedOrderStatus: OrderStatus | undefined =
        status === ShipmentStatus.SHIPPED
          ? OrderStatus.SHIPPED
          : status === ShipmentStatus.IN_TRANSIT
          ? OrderStatus.IN_TRANSIT
          : status === ShipmentStatus.OUT_FOR_DELIVERY
          ? OrderStatus.OUT_FOR_DELIVERY
          : status === ShipmentStatus.DELIVERED
          ? OrderStatus.DELIVERED
          : undefined;

      if (mappedOrderStatus) {
        const orderBeforeUpdate = await tx.order.findUnique({
          where: { id: s.orderId },
          select: { status: true },
        });
        const orderUpdate = await tx.order.updateMany({
          where: {
            id: s.orderId,
            status: {
              in: [
                OrderStatus.PAID,
                OrderStatus.PROCESSING,
                OrderStatus.PACKED,
                OrderStatus.SHIPPED,
                OrderStatus.IN_TRANSIT,
                OrderStatus.OUT_FOR_DELIVERY,
              ],
            },
          },
          data: {
            status: mappedOrderStatus,
            ...(mappedOrderStatus === OrderStatus.DELIVERED ? { deliveredAt: now } : {}),
            ...(mappedOrderStatus === OrderStatus.SHIPPED ? { shippedAt: now } : {}),
          },
        });
        if (orderUpdate.count === 1 && orderBeforeUpdate && orderBeforeUpdate.status !== mappedOrderStatus) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: s.orderId,
              oldStatus: orderBeforeUpdate.status,
              newStatus: mappedOrderStatus,
              reason: `SHIPMENT_STATUS_${status}`,
              changedBy: 'SHIPMENT_TRACKING',
            },
          });
        }
      }

      return shipment;
    });
  }

  private buildTrackingTimeline(order: any, shipment: any): TrackingCheckpoint[] {
    const statusOrder: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.IN_TRANSIT,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];

    const currentIdx = statusOrder.indexOf(order.status);

    const getStatusDate = (status: OrderStatus): string | undefined => {
      const history = order.statusHistory?.find((h: any) => h.newStatus === status);
      return history?.createdAt ? new Date(history.createdAt).toISOString() : undefined;
    };

    const latestEvent = shipment?.trackingEvents?.[shipment.trackingEvents.length - 1];

    return [
      {
        key: 'ORDERED',
        label: 'Order Placed',
        completed: true,
        active: order.status === OrderStatus.PENDING_PAYMENT,
        timestamp: order.createdAt.toISOString(),
        description: 'Order details confirmed',
      },
      {
        key: 'PAID',
        label: 'Payment Confirmed',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.PAID),
        active: order.status === OrderStatus.PAID,
        timestamp: getStatusDate(OrderStatus.PAID),
        description: 'Payment authorized & verified',
      },
      {
        key: 'PACKED',
        label: 'Packed & Sealed',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.PACKED),
        active: order.status === OrderStatus.PACKED || order.status === OrderStatus.PROCESSING,
        timestamp: getStatusDate(OrderStatus.PACKED) || getStatusDate(OrderStatus.PROCESSING),
        description: 'Handcrafted selections packed in Chennai atelier',
      },
      {
        key: 'SHIPPED',
        label: 'Dispatched',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.SHIPPED),
        active: order.status === OrderStatus.SHIPPED,
        timestamp: order.shippedAt ? new Date(order.shippedAt).toISOString() : getStatusDate(OrderStatus.SHIPPED),
        description: 'Handed over to India Post Speed Post',
        location: 'Chennai Central Parcel Hub',
      },
      {
        key: 'IN_TRANSIT',
        label: 'In Transit',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.IN_TRANSIT),
        active: order.status === OrderStatus.IN_TRANSIT,
        timestamp: getStatusDate(OrderStatus.IN_TRANSIT),
        description: latestEvent?.description || 'Consignment moving through postal network',
        location: latestEvent?.location || undefined,
      },
      {
        key: 'OUT_FOR_DELIVERY',
        label: 'Out for Delivery',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.OUT_FOR_DELIVERY),
        active: order.status === OrderStatus.OUT_FOR_DELIVERY,
        timestamp: getStatusDate(OrderStatus.OUT_FOR_DELIVERY),
        description: 'Postman out for delivery to your doorstep',
      },
      {
        key: 'DELIVERED',
        label: 'Delivered',
        completed: currentIdx >= statusOrder.indexOf(OrderStatus.DELIVERED),
        active: order.status === OrderStatus.DELIVERED,
        timestamp: order.deliveredAt ? new Date(order.deliveredAt).toISOString() : getStatusDate(OrderStatus.DELIVERED),
        description: 'Delivered safely into your kitchen',
      },
    ];
  }
}
