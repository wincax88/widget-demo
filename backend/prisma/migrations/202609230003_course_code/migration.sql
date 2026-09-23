ALTER TABLE "courses" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "courses_tenant_id_code_key" ON "courses"("tenant_id", "code");
