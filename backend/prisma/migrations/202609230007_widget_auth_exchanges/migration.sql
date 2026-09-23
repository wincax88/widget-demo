CREATE TABLE "widget_auth_exchanges" (
    "key_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_ciphertext" BYTEA,
    "response_iv" BYTEA,
    "response_tag" BYTEA,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "widget_auth_exchanges_pkey" PRIMARY KEY ("key_hash")
);

CREATE INDEX "widget_auth_exchanges_expires_at_idx" ON "widget_auth_exchanges"("expires_at");
