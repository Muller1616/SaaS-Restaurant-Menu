-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN "actor_label" TEXT NOT NULL DEFAULT '';
ALTER TABLE "activity_logs" ADD COLUMN "entity_label" TEXT;
ALTER TABLE "activity_logs" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';

-- Backfill readable summaries for existing rows (IDs remain for relations)
UPDATE "activity_logs"
SET
  "summary" = CASE "action"
    WHEN 'LOGIN' THEN "user_type" || ' signed in'
    WHEN 'LOGOUT' THEN "user_type" || ' signed out'
    ELSE "user_type" || ' ' || lower("action"::text) || ' ' || replace("entity_type", '_', ' ')
  END,
  "actor_label" = CASE "user_type"
    WHEN 'ADMIN' THEN 'Admin'
    WHEN 'TENANT' THEN 'Restaurant'
    ELSE "user_type"::text
  END
WHERE "summary" = '';
