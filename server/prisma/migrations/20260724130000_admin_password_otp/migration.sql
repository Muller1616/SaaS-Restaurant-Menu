-- Admin forgot-password OTP table
CREATE TABLE IF NOT EXISTS "admin_password_otps" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "otp_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "reset_token_hash" TEXT,
  "reset_expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_password_otps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_password_otps_reset_token_hash_key"
  ON "admin_password_otps"("reset_token_hash");
CREATE INDEX IF NOT EXISTS "admin_password_otps_admin_id_created_at_idx"
  ON "admin_password_otps"("admin_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_password_otps_admin_id_fkey'
  ) THEN
    ALTER TABLE "admin_password_otps"
      ADD CONSTRAINT "admin_password_otps_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
