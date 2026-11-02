import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  const order = {
    id: 'order-1',
    orderNumber: 'SP-000001',
    status: OrderStatus.PACKED,
    items: [],
    shippedAt: null,
  };
  const shipment = {
    id: 'shipment-1',
    orderId: 'order-1',
    carrier: 'India Post',
    trackingNumber: 'EM123456789IN',
    trackingUrl: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx',
    status: ShipmentStatus.SHIPPED,
  };

  let tx: any;
  let prisma: any;
  let notifications: any;
  let service: ShippingService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({ ...order, status: OrderStatus.SHIPPED }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shipment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(shipment),
        update: jest.fn().mockResolvedValue(shipment),
      },
      shipmentTrackingEvent: { create: jest.fn().mockResolvedValue({ id: 'tracking-event-1' }) },
      orderStatusHistory: { create: jest.fn().mockResolvedValue({ id: 'history-1' }) },
    };
    prisma = { $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)) };
    notifications = { enqueueShipmentStatus: jest.fn().mockResolvedValue(undefined) };
    service = new ShippingService(prisma, notifications, {} as any, {} as any);
  });

  describe('checkServiceability', () => {
    it('rejects malformed PIN codes', async () => {
      await expect(service.checkServiceability('12345')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.checkServiceability('000000')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.checkServiceability('ABCDEF')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not treat a syntactically valid PIN as verified serviceability', async () => {
      await expect(service.checkServiceability('600004')).resolves.toEqual({
        serviceable: false,
        verified: false,
        carrier: 'India Post Speed Post',
        estimatedDays: 'Unverified',
        pincode: '600004',
        message: 'Delivery serviceability is not currently verified for this PIN code.',
      });
    });

    it('normalizes whitespace before validating and returning the PIN', async () => {
      await expect(service.checkServiceability(' 600004 ')).resolves.toMatchObject({
        serviceable: false,
        verified: false,
        pincode: '600004',
      });
    });
  });

  describe('fulfillOrder', () => {
    it('dispatches only a PACKED order and records shipment, history and notification atomically', async () => {
      await service.fulfillOrder('order-1', ' EM123456789IN ', 'admin-1');

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.shipment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          carrier: 'India Post',
          trackingNumber: 'EM123456789IN',
          status: ShipmentStatus.SHIPPED,
        }),
      });
      expect(tx.shipmentTrackingEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shipmentId: 'shipment-1',
          status: ShipmentStatus.SHIPPED,
        }),
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: OrderStatus.SHIPPED, trackingNumber: 'EM123456789IN' }),
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalled();
      expect(notifications.enqueueShipmentStatus).toHaveBeenCalledWith(
        'order-1',
        'shipment-1',
        ShipmentStatus.SHIPPED,
        tx,
      );
    });

    it('rejects dispatch from a state other than PACKED', async () => {
      tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.PAID });

      await expect(service.fulfillOrder('order-1', 'EM123456789IN', 'admin-1'))
        .rejects.toBeInstanceOf(BadRequestException);

      expect(tx.shipment.create).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(notifications.enqueueShipmentStatus).not.toHaveBeenCalled();
    });

    it('rejects empty or malformed tracking identifiers before opening a transaction', async () => {
      await expect(service.fulfillOrder('order-1', '  ')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('returns an existing shipment instead of creating a duplicate manifest', async () => {
      tx.shipment.findUnique.mockResolvedValue(shipment);

      await expect(service.create('order-1')).resolves.toBe(shipment);
      expect(tx.shipment.create).not.toHaveBeenCalled();
    });

    it('rejects non-India Post carriers', async () => {
      await expect(service.create('order-1', 'Other Carrier')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('addEvent', () => {
    it('synchronizes shipment and order when a valid tracking transition arrives', async () => {
      tx.$queryRaw.mockResolvedValue([{
        id: 'shipment-1',
        orderId: 'order-1',
        status: ShipmentStatus.SHIPPED,
        carrier: 'India Post',
        trackingNumber: 'EM123456789IN',
        trackingUrl: null,
        dispatchedAt: new Date('2026-11-01T10:00:00.000Z'),
        deliveredAt: null,
      }]);

      await service.addEvent('shipment-1', ShipmentStatus.IN_TRANSIT, 'Chennai', 'Consignment in transit');

      expect(tx.shipment.update).toHaveBeenCalledWith({
        where: { id: 'shipment-1' },
        data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT }),
      });
      expect(tx.shipmentTrackingEvent.create).toHaveBeenCalledWith({
        data: {
          shipmentId: 'shipment-1',
          status: ShipmentStatus.IN_TRANSIT,
          location: 'Chennai',
          description: 'Consignment in transit',
        },
      });
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'order-1' }),
        data: { status: OrderStatus.IN_TRANSIT },
      });
      expect(notifications.enqueueShipmentStatus).toHaveBeenCalledWith(
        'order-1',
        'shipment-1',
        ShipmentStatus.IN_TRANSIT,
        tx,
      );
      expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    });

    it('rejects an invalid transition without changing shipment or order state', async () => {
      tx.$queryRaw.mockResolvedValue([{
        id: 'shipment-1',
        orderId: 'order-1',
        status: ShipmentStatus.DELIVERED,
        carrier: 'India Post',
        trackingNumber: 'EM123456789IN',
        trackingUrl: null,
        dispatchedAt: new Date('2026-11-01T10:00:00.000Z'),
        deliveredAt: new Date('2026-11-02T10:00:00.000Z'),
      }]);

      await expect(service.addEvent('shipment-1', ShipmentStatus.IN_TRANSIT))
        .rejects.toBeInstanceOf(BadRequestException);

      expect(tx.shipment.update).not.toHaveBeenCalled();
      expect(tx.shipmentTrackingEvent.create).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(notifications.enqueueShipmentStatus).not.toHaveBeenCalled();
    });
  });
});
