-- Keep the deployed PostgreSQL schema aligned with schema.prisma.
-- Enum values are additive and safe for existing rows.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';

-- Order-level tracking fields are queried by checkout, fulfillment and tracking.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "courier_partner" TEXT NOT NULL DEFAULT 'India Post',
  ADD COLUMN IF NOT EXISTS "tracking_number" TEXT,
  ADD COLUMN IF NOT EXISTS "tracking_url" TEXT,
  ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_tracking_number_key"
  ON "orders"("tracking_number");
