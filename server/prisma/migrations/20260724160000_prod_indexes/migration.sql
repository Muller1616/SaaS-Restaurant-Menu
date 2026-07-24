-- Production indexes for admin dashboard date filters and subscription expiry scans.
CREATE INDEX IF NOT EXISTS "tenants_created_at_idx" ON "tenants"("created_at");
CREATE INDEX IF NOT EXISTS "payments_created_at_idx" ON "payments"("created_at");
CREATE INDEX IF NOT EXISTS "subscriptions_status_expiry_date_idx" ON "subscriptions"("status", "expiry_date");
