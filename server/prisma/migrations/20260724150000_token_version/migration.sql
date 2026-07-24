-- JWT session revocation via token versioning
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
