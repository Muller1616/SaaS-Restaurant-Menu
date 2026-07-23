-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "activated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "activation_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activation_tokens_token_hash_key" ON "activation_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "activation_tokens_tenant_id_idx" ON "activation_tokens"("tenant_id");

-- AddForeignKey
ALTER TABLE "activation_tokens" ADD CONSTRAINT "activation_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: already-active owners who finished password setup stay signed-in capable
UPDATE "tenants"
SET "activated_at" = COALESCE("updated_at", "created_at")
WHERE "status" = 'ACTIVE'
  AND "must_change_password" = false
  AND "password_hash" IS NOT NULL
  AND "activated_at" IS NULL;
