ALTER TABLE "widget_refresh_sessions" ADD COLUMN "identity_id" TEXT;
ALTER TABLE "widget_refresh_sessions" ADD COLUMN "scope" TEXT;

UPDATE "widget_refresh_sessions"
SET "identity_id" = "user_id", "scope" = 'widget.data.read'
WHERE "identity_id" IS NULL OR "scope" IS NULL;

ALTER TABLE "widget_refresh_sessions" ALTER COLUMN "identity_id" SET NOT NULL;
ALTER TABLE "widget_refresh_sessions" ALTER COLUMN "scope" SET NOT NULL;
