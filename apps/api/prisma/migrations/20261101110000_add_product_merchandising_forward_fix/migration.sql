-- Forward-only repair for databases where the original merchandising
-- migration was already recorded as applied while its SQL file was empty.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "merchandising" JSONB DEFAULT '{}';
