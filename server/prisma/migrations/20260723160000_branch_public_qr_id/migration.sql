-- AlterTable
ALTER TABLE "branches" ADD COLUMN "public_qr_id" TEXT;

-- Backfill unique opaque QR ids (32 hex chars)
UPDATE "branches"
SET "public_qr_id" = replace(gen_random_uuid()::text, '-', '')
WHERE "public_qr_id" IS NULL;

-- Harden any residual nulls (should be none)
UPDATE "branches"
SET "public_qr_id" = md5(random()::text || id)
WHERE "public_qr_id" IS NULL;

ALTER TABLE "branches" ALTER COLUMN "public_qr_id" SET NOT NULL;

CREATE UNIQUE INDEX "branches_public_qr_id_key" ON "branches"("public_qr_id");
