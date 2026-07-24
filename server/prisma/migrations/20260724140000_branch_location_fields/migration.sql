-- Structured branch location + manager fields
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "manager_name" TEXT;
