-- The webhook's auth_server_url is a base origin, not the Keycloak realm issuer.
-- Repair only rows where the saved issuer is that exact origin; preserve custom issuers.
UPDATE "tenants"
SET "issuer_url" = regexp_replace("token_endpoint", '/protocol/openid-connect/token/?$', ''),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "token_endpoint" ~ '^https?://[^/]+/realms/[^/]+/protocol/openid-connect/token/?$'
  AND "issuer_url" = regexp_replace(
    "token_endpoint", '/realms/[^/]+/protocol/openid-connect/token/?$', ''
  );
