-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATING', 'FAILED', 'APPLIED');

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exam_date" TIMESTAMP(3) NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "maximum_score" DECIMAL(8,2) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "grader_id" TEXT NOT NULL,
    "value" DECIMAL(8,2),
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_imports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "applied_rows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "score_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_import_errors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "raw_value" JSONB,

    CONSTRAINT "score_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_tenant_id_status_exam_date_idx" ON "exams"("tenant_id", "status", "exam_date");

-- CreateIndex
CREATE INDEX "exams_tenant_id_classroom_id_exam_date_idx" ON "exams"("tenant_id", "classroom_id", "exam_date");

-- CreateIndex
CREATE UNIQUE INDEX "exams_tenant_id_id_key" ON "exams"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "exam_subjects_tenant_id_exam_id_display_order_idx" ON "exam_subjects"("tenant_id", "exam_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_tenant_id_id_key" ON "exam_subjects"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_tenant_id_exam_id_course_id_key" ON "exam_subjects"("tenant_id", "exam_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_tenant_id_exam_id_id_key" ON "exam_subjects"("tenant_id", "exam_id", "id");

-- CreateIndex
CREATE INDEX "scores_tenant_id_student_id_exam_id_idx" ON "scores"("tenant_id", "student_id", "exam_id");

-- CreateIndex
CREATE INDEX "scores_tenant_id_exam_id_subject_id_idx" ON "scores"("tenant_id", "exam_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_tenant_id_exam_id_student_id_subject_id_key" ON "scores"("tenant_id", "exam_id", "student_id", "subject_id");

-- CreateIndex
CREATE INDEX "score_imports_tenant_id_exam_id_created_at_idx" ON "score_imports"("tenant_id", "exam_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "score_imports_tenant_id_id_key" ON "score_imports"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "score_import_errors_tenant_id_import_id_row_number_idx" ON "score_import_errors"("tenant_id", "import_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_tenant_id_id_key" ON "classrooms"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_id_key" ON "courses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenant_id_id_key" ON "people"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_tenant_id_creator_id_fkey" FOREIGN KEY ("tenant_id", "creator_id") REFERENCES "people"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_tenant_id_classroom_id_fkey" FOREIGN KEY ("tenant_id", "classroom_id") REFERENCES "classrooms"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_tenant_id_exam_id_fkey" FOREIGN KEY ("tenant_id", "exam_id") REFERENCES "exams"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_exam_id_fkey" FOREIGN KEY ("tenant_id", "exam_id") REFERENCES "exams"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_exam_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "exam_id", "subject_id") REFERENCES "exam_subjects"("tenant_id", "exam_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "people"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_tenant_id_grader_id_fkey" FOREIGN KEY ("tenant_id", "grader_id") REFERENCES "people"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_imports" ADD CONSTRAINT "score_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_imports" ADD CONSTRAINT "score_imports_tenant_id_exam_id_fkey" FOREIGN KEY ("tenant_id", "exam_id") REFERENCES "exams"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_imports" ADD CONSTRAINT "score_imports_tenant_id_created_by_id_fkey" FOREIGN KEY ("tenant_id", "created_by_id") REFERENCES "people"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_import_errors" ADD CONSTRAINT "score_import_errors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_import_errors" ADD CONSTRAINT "score_import_errors_tenant_id_import_id_fkey" FOREIGN KEY ("tenant_id", "import_id") REFERENCES "score_imports"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
