-- CreateTable
CREATE TABLE "widget_refresh_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "identity_type" TEXT NOT NULL,
    "app_code" TEXT NOT NULL,
    "config_snapshot_id" TEXT NOT NULL,
    "access_token_hash" TEXT NOT NULL,
    "refresh_token_ciphertext" BYTEA NOT NULL,
    "refresh_token_iv" BYTEA NOT NULL,
    "refresh_token_tag" BYTEA NOT NULL,
    "authorization_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widget_refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "widget_refresh_sessions_tenant_id_user_id_app_code_expires_at_idx"
ON "widget_refresh_sessions"("tenant_id", "user_id", "app_code", "expires_at");

-- AddForeignKey
ALTER TABLE "widget_refresh_sessions"
ADD CONSTRAINT "widget_refresh_sessions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
