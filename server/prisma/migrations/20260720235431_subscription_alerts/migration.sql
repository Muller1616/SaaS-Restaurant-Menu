-- CreateEnum
CREATE TYPE "SubscriptionAlertKind" AS ENUM ('NEAR_EXPIRY_7', 'NEAR_EXPIRY_3', 'NEAR_EXPIRY_1', 'EXPIRED');

-- CreateTable
CREATE TABLE "subscription_alerts" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "kind" "SubscriptionAlertKind" NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_alerts_kind_sent_at_idx" ON "subscription_alerts"("kind", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_alerts_subscription_id_kind_expiry_date_key" ON "subscription_alerts"("subscription_id", "kind", "expiry_date");

-- AddForeignKey
ALTER TABLE "subscription_alerts" ADD CONSTRAINT "subscription_alerts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
