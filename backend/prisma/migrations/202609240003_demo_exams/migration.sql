ALTER TABLE "exams" ADD COLUMN "demo_key" TEXT;
ALTER TABLE "exams" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "exams_tenant_id_demo_key_key" ON "exams"("tenant_id", "demo_key");
