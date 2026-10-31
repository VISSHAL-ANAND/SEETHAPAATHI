import { z } from 'zod';

export const ShipmentStatusSchema = z.enum([
  'CREATED', 'AWB_ASSIGNED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]);

export const CreateShipmentRequestSchema = z.object({
  carrier: z.string().trim().min(2).max(120),
  trackingNumber: z.string().trim().min(2).max(120).optional(),
  trackingUrl: z.string().url().max(2048).optional(),
});

export const ManualTrackingRequestSchema = z.object({
  courierName: z.string().trim().min(2).max(120),
  trackingNumber: z.string().trim().min(2).max(120),
  trackingUrl: z.string().url().max(2048).optional(),
});

export const FulfillOrderRequestSchema = z.object({
  trackingNumber: z.string().trim().min(3).max(120),
});

export const ShipmentEventRequestSchema = z.object({
  status: ShipmentStatusSchema,
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const ServiceabilityQuerySchema = z.object({
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Must be a valid 6-digit Indian PIN code'),
});

export type CreateShipmentRequest = z.infer<typeof CreateShipmentRequestSchema>;
export type ManualTrackingRequest = z.infer<typeof ManualTrackingRequestSchema>;
export type FulfillOrderRequest = z.infer<typeof FulfillOrderRequestSchema>;
export type ShipmentEventRequest = z.infer<typeof ShipmentEventRequestSchema>;
export type ServiceabilityQuery = z.infer<typeof ServiceabilityQuerySchema>;
