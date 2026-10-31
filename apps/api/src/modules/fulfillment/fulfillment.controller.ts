import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateShipmentRequestSchema,
  FulfillOrderRequestSchema,
  FulfillOrderRequest,
  ManualTrackingRequestSchema,
  ManualTrackingRequest,
  PermissionName,
  ShipmentEventRequestSchema,
} from '@seethapaati/contracts';
import { ShipmentStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ShippingService } from './shipping.service';

@Controller()
export class FulfillmentController {
  constructor(private readonly shipping: ShippingService) {}

  /**
   * Customer & Staff Order Tracking
   */
  @Get('orders/:id/track')
  async track(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: { id: string; permissions: string[] },
  ) {
    return {
      success: true,
      data: await this.shipping.track(
        id,
        u.id,
        u.permissions.includes(PermissionName.ORDERS_READ_ALL),
      ),
    };
  }

  /**
   * Admin Order Fulfillment via India Post
   * @route POST /api/admin/orders/:id/fulfill
   * Accepts { trackingNumber: string }, flips status to SHIPPED, and links India Post tracking.
   */
  @Post('admin/orders/:id/fulfill')
  @Permissions(PermissionName.SHIPMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  async fulfillOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(FulfillOrderRequestSchema)) b: FulfillOrderRequest,
    @CurrentUser() u: { id: string; permissions: string[] },
  ) {
    const data = await this.shipping.fulfillOrder(id, b.trackingNumber, u.id);
    return {
      success: true,
      message: 'Order dispatched via India Post Speed Post',
      data,
    };
  }

  /**
   * Manual Admin Tracking Entry (Backwards compatibility)
   */
  @Post('admin/orders/:id/tracking')
  @Permissions(PermissionName.SHIPMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  async manualTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ManualTrackingRequestSchema)) b: ManualTrackingRequest,
    @CurrentUser() u: { id: string; permissions: string[] },
  ) {
    const data = await this.shipping.fulfillOrder(id, b.trackingNumber, u.id);
    return {
      success: true,
      message: 'Tracking updated and order dispatched',
      data,
    };
  }

  /**
   * Create standard shipment manifest
   */
  @Post('admin/orders/:id/shipments')
  @Permissions(PermissionName.SHIPMENTS_MANAGE)
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateShipmentRequestSchema)) b: {
      carrier: string;
      trackingNumber?: string;
      trackingUrl?: string;
    },
  ) {
    return {
      success: true,
      data: await this.shipping.create(id, b.carrier, b.trackingNumber, b.trackingUrl),
    };
  }

  /**
   * Add granular shipment tracking checkpoint
   */
  @Post('admin/shipments/:id/events')
  @Permissions(PermissionName.SHIPMENTS_MANAGE)
  async event(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ShipmentEventRequestSchema)) b: {
      status: ShipmentStatus;
      location?: string;
      description?: string;
    },
  ) {
    return {
      success: true,
      data: await this.shipping.addEvent(id, b.status, b.location, b.description),
    };
  }

  /**
   * Delivery Pincode Serviceability Check
   *
   * @route GET /shipping/serviceability?pincode=600004
   * Validates 6-digit Indian postal code (/^[1-9][0-9]{5}$/).
   * Returns serviceable: true, carrier: "India Post Speed Post", estimatedDays: "3-5 Business Days".
   */
  @Public()
  @SkipThrottle()
  @Get('shipping/serviceability')
  async serviceability(@Query('pincode') pincode: string) {
    const data = await this.shipping.checkServiceability(pincode);
    return {
      success: true,
      serviceable: data.serviceable,
      carrier: data.carrier,
      estimatedDays: data.estimatedDays,
      data,
    };
  }
}
