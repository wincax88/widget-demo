-- CreateTable
CREATE TABLE "student_class_relations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_class_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_class_relations_tenant_id_classroom_id_active_idx" ON "student_class_relations"("tenant_id", "classroom_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "student_class_relations_tenant_id_eduplus_id_key" ON "student_class_relations"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_class_relations_tenant_id_student_id_classroom_id_key" ON "student_class_relations"("tenant_id", "student_id", "classroom_id");

-- AddForeignKey
ALTER TABLE "student_class_relations" ADD CONSTRAINT "student_class_relations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_relations" ADD CONSTRAINT "student_class_relations_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "people"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_relations" ADD CONSTRAINT "student_class_relations_tenant_id_classroom_id_fkey" FOREIGN KEY ("tenant_id", "classroom_id") REFERENCES "classrooms"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
