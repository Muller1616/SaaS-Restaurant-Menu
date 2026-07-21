-- CreateEnum
CREATE TYPE "SubscriptionEventKind" AS ENUM ('CREATED', 'EXTENDED', 'PAYMENT_APPROVED', 'STATUS_CHANGED', 'CANCELLED', 'RENEWAL_SUBMITTED', 'RETENTION_PURGED');

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "SubscriptionEventKind" NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "summary" TEXT NOT NULL,
    "actor_type" "ActivityUserType",
    "actor_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_events_branch_id_created_at_idx" ON "subscription_events"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_events_subscription_id_created_at_idx" ON "subscription_events"("subscription_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
