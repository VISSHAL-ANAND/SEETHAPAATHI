import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateShipmentRequestSchema,
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
   * Manual Admin Tracking Entry
   * Updates courier name, tracking number (AWB), and tracking URL,
   * immediately flipping the order status to SHIPPED.
   */
  @Post('admin/orders/:id/tracking')
  @Permissions(PermissionName.SHIPMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  async manualTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ManualTrackingRequestSchema)) b: ManualTrackingRequest,
    @CurrentUser() u: { id: string; permissions: string[] },
  ) {
    const data = await this.shipping.updateManualTracking(
      id,
      b.courierName,
      b.trackingNumber,
      b.trackingUrl,
      u.id,
    );
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
   * @route GET /shipping/serviceability?pincode=600001&weight=500
   * @param pincode - 6-digit delivery pincode
   * @param weight  - package weight in grams (default: 500)
   *
   * Returns courier availability and estimated delivery days for the given pincode.
   * Results are cached in Redis for 6 hours to minimize Shiprocket API calls.
   */
  @Public()
  @SkipThrottle()
  @Get('shipping/serviceability')
  async serviceability(
    @Query('pincode') pincode: string,
    @Query('weight') weight?: string,
  ) {
    const weightGrams = weight ? parseInt(weight, 10) : 500;
    const data = await this.shipping.checkServiceability(pincode, weightGrams);
    return { success: true, data };
  }

  /**
   * Live Automated Shipping Webhook Endpoint (Shiprocket / Logistics Partners)
   *
   * Always returns HTTP 200 — Shiprocket retries on non-200 responses.
   * Optional webhook token validation via X-Shiprocket-Token header.
   */
  @Public()
  @SkipThrottle()
  @Post('webhooks/shipping')
  @HttpCode(HttpStatus.OK)
  async shippingWebhook(
    @Body() payload: any,
    @Headers('x-shiprocket-token') webhookToken?: string,
  ) {
    return await this.shipping.processShippingWebhook(payload, webhookToken);
  }
}
