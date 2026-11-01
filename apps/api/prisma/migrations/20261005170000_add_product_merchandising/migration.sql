-- Product merchandising metadata used by catalog queries.
-- Nullable to preserve existing product rows; default keeps new rows predictable.
ALTER TABLE "products"
  ADD COLUMN "merchandising" JSONB DEFAULT '{}';
