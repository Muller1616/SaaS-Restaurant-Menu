-- CreateTable
CREATE TABLE "menu_views" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(255),
    "referer" VARCHAR(500),

    CONSTRAINT "menu_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_views_branch_id_viewed_at_idx" ON "menu_views"("branch_id", "viewed_at");

-- CreateIndex
CREATE INDEX "menu_views_tenant_id_viewed_at_idx" ON "menu_views"("tenant_id", "viewed_at");

-- AddForeignKey
ALTER TABLE "menu_views" ADD CONSTRAINT "menu_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_views" ADD CONSTRAINT "menu_views_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
