-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('OAUTH_CLIENT_SECRET', 'WEBHOOK_SECRET');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STAFF', 'TEACHER', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "eduplus_tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "issuer_url" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "client_id" TEXT,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authentication_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "event_name" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "app_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "person_id" TEXT,
    "identity_id" TEXT NOT NULL,
    "identity_type" "PersonType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "refresh_ciphertext" BYTEA,
    "refresh_iv" BYTEA,
    "refresh_authentication_tag" BYTEA,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_sync_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "counts" JSONB,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "directory_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "type" "PersonType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_student_relations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eduplus_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_student_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_eduplus_tenant_id_key" ON "tenants"("eduplus_tenant_id");

-- CreateIndex
CREATE INDEX "tenant_credentials_tenant_id_revoked_at_idx" ON "tenant_credentials"("tenant_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_credentials_tenant_id_kind_key" ON "tenant_credentials"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "webhook_receipts_tenant_id_received_at_idx" ON "webhook_receipts"("tenant_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_sessions_token_hash_key" ON "app_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "app_sessions_tenant_id_identity_id_revoked_at_idx" ON "app_sessions"("tenant_id", "identity_id", "revoked_at");

-- CreateIndex
CREATE INDEX "directory_sync_runs_tenant_id_started_at_idx" ON "directory_sync_runs"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "people_tenant_id_type_active_idx" ON "people"("tenant_id", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "people_tenant_id_eduplus_id_key" ON "people"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE INDEX "classrooms_tenant_id_active_idx" ON "classrooms"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_tenant_id_eduplus_id_key" ON "classrooms"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE INDEX "courses_tenant_id_active_idx" ON "courses"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_eduplus_id_key" ON "courses"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_tenant_id_teacher_id_active_idx" ON "teaching_assignments"("tenant_id", "teacher_id", "active");

-- CreateIndex
CREATE INDEX "teaching_assignments_tenant_id_classroom_id_course_id_idx" ON "teaching_assignments"("tenant_id", "classroom_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_tenant_id_eduplus_id_key" ON "teaching_assignments"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE INDEX "parent_student_relations_tenant_id_student_id_active_idx" ON "parent_student_relations"("tenant_id", "student_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_relations_tenant_id_eduplus_id_key" ON "parent_student_relations"("tenant_id", "eduplus_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_relations_tenant_id_parent_id_student_id_key" ON "parent_student_relations"("tenant_id", "parent_id", "student_id");

-- AddForeignKey
ALTER TABLE "tenant_credentials" ADD CONSTRAINT "tenant_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_sync_runs" ADD CONSTRAINT "directory_sync_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_relations" ADD CONSTRAINT "parent_student_relations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
