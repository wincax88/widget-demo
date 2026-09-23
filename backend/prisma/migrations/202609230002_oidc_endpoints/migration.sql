ALTER TABLE "tenants"
ADD COLUMN "authorization_endpoint" TEXT,
ADD COLUMN "token_endpoint" TEXT,
ADD COLUMN "jwks_uri" TEXT;
