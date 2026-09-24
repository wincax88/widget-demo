ALTER TABLE "people" ADD COLUMN "eduplus_user_id" TEXT;

CREATE INDEX "people_tenant_id_type_eduplus_user_id_idx"
ON "people"("tenant_id", "type", "eduplus_user_id");
