-- Soft-delete support for menu items (SRS data-safety pattern).
ALTER TABLE "menu_items" ADD COLUMN "deleted_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "menu_items_branch_id_idx";
CREATE INDEX "menu_items_branch_id_deleted_at_idx" ON "menu_items"("branch_id", "deleted_at");
