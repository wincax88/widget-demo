# Widget Demo Partial Directory Sync Implementation Plan

> **For agentic workers:** Execute inline in this task; the user requested a shortened workflow. Use test-first changes and verify each task.

**Goal:** Import five base master-data types without cross-identity overwrites and report the three intentionally omitted relationship types as a partial sync.

**Architecture:** Keep the existing authenticated EduPlus paging client. Change the local person key to `${entityType}:${record.id}`, persist `PARTIAL` for a completed base import, count the skipped relationships, and make the sync page clearly show the limitation. Do not change EduPlus or authorization rules.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React/Ant Design, Jest/Vitest.

---

### Task 1: Backend regression tests

**Files:** `backend/src/directory-sync/directory-sync.service.spec.ts`

- [x] Change the complete-snapshot test to expect `partial`, `PARTIAL`, zero persisted relationship rows, and `skipped_*` counts matching the fixture.
- [x] Add a test that supplies teacher, student, and parent records with the same numeric `id` and null `external_id`, then asserts three distinct local `eduplusId` values: `teacher:<id>`, `student:<id>`, `parent:<id>`.
- [x] Run `npm test -- --runInBand directory-sync.service.spec.ts` against the test PostgreSQL and confirm failure for the expected behavior before changing service code.

### Task 2: Backend implementation

**Files:** `backend/src/directory-sync/directory-sync.service.ts`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/202609240001_partial_directory_sync/migration.sql`

- [x] Add `PARTIAL` to `SyncStatus` and SQL `ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';`; regenerate Prisma client and apply the migration to the test database.
- [x] Keep fetching the existing eight API types. Upsert only `teacher`, `student`, `parent`, `class`, and `course`; remove relationship writes from this sync path.
- [x] Use `${entityType}:${record.id}` as the local person key and return/persist `PARTIAL` with five imported counts and three `skipped_*` counts. Keep the existing catch path for real failures.
- [x] Re-run the focused test until green, then run the backend suite and build.

### Task 3: Frontend warning and tests

**Files:** `frontend/src/pages/SyncPage.tsx`, `frontend/src/pages/SyncPage.test.tsx`, `frontend/src/services/api.ts`

- [x] Write a failing page test for a partial response: visible warning, Chinese data labels, and separate imported/skipped numbers.
- [x] Implement the minimum UI and API typing. Update the description so it does not claim relationships are imported.
- [x] Run the focused frontend test, frontend suite, and build.

### Task 4: Release verification

**Files:** only the above plus the plan/spec docs.

- [ ] Check `git diff --check`, review changed paths, and verify no `edu-plus-2` file changed.
- [ ] Commit in Chinese, push `widget-demo` main, wait for the existing GitHub Action deployment, and verify public health plus a real `main09` sync response and persisted counts without printing private data.
