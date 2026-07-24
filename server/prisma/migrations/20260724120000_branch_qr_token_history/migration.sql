-- Branch-aware QR token history + audit timestamps
CREATE TYPE "BranchQrTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "qr_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "qr_regenerated_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "branch_qr_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "BranchQrTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_by_type" "ActivityUserType",
  "created_by_id" TEXT,
  CONSTRAINT "branch_qr_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branch_qr_tokens_token_key" ON "branch_qr_tokens"("token");
CREATE INDEX IF NOT EXISTS "branch_qr_tokens_branch_id_status_idx" ON "branch_qr_tokens"("branch_id", "status");
CREATE INDEX IF NOT EXISTS "branch_qr_tokens_tenant_id_idx" ON "branch_qr_tokens"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_qr_tokens_branch_id_fkey'
  ) THEN
    ALTER TABLE "branch_qr_tokens"
      ADD CONSTRAINT "branch_qr_tokens_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill one ACTIVE history row per existing branch public QR id
INSERT INTO "branch_qr_tokens" ("id", "token", "branch_id", "tenant_id", "status", "created_at")
SELECT
  'bqr_' || substr(md5(random()::text || clock_timestamp()::text || b.id), 1, 24),
  b.public_qr_id,
  b.id,
  b.tenant_id,
  'ACTIVE',
  COALESCE(b.qr_created_at, b.created_at)
FROM "branches" b
WHERE NOT EXISTS (
  SELECT 1 FROM "branch_qr_tokens" t WHERE t.token = b.public_qr_id
);
