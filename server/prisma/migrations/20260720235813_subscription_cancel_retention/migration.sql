-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "retention_purged_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "subscriptions_cancelled_at_idx" ON "subscriptions"("cancelled_at");
