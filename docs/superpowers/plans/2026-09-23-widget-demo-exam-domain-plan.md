# Widget Demo Examination Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real multi-tenant examination, score entry/import, publication, ranking, and role-scoped result experiences for teachers, students, and parents.

**Architecture:** Examination writes live in a transaction-oriented NestJS domain module and reference synchronized directory projections. Authorization is enforced in services from the authenticated tenant and identity, never from body-supplied tenant or student claims. The React UI uses separate role-oriented routes over the same APIs.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest/Supertest, React 19, Ant Design, Vitest, CSV parsing

---

### Task 1: Add examination persistence and invariants

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202609230002_examination_domain/migration.sql`
- Create: `backend/src/exams/exam.types.ts`
- Test: `backend/src/exams/exam-schema.integration.spec.ts`

- [ ] **Step 1: Write the failing schema integration test**

Create one exam with two subjects and assert the database rejects a duplicate `(examId, studentId, subjectId)` score and cross-tenant foreign-key assembly through service validation.

- [ ] **Step 2: Add models and enums**

Define `Exam`, `ExamSubject`, `Score`, `ScoreImport`, and `ScoreImportError`. Use explicit states:

```prisma
enum ExamStatus { DRAFT PUBLISHED WITHDRAWN }
enum ImportStatus { VALIDATING FAILED APPLIED }
```

`Exam` stores tenant, creator, classroom, title, custom type, exam date and publication timestamps. `ExamSubject` stores course/subject identity, maximum score and display order. `Score` stores nullable decimal score, absence flag, grader and updated time. Every index starts with `tenantId` where tenant filtering is expected.

- [ ] **Step 3: Generate/apply migration and run the test**

Run: `npx prisma migrate dev --name examination_domain`

Run: `npm test -- exam-schema.integration.spec.ts --runInBand`

Expected: migration applies and invariants pass.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma backend/src/exams/exam.types.ts backend/src/exams/exam-schema.integration.spec.ts
git commit -m "feat: add examination persistence"
```

### Task 2: Enforce teacher assignment and examination lifecycle

**Files:**
- Create: `backend/src/exams/exams.service.ts`
- Create: `backend/src/exams/exams.controller.ts`
- Create: `backend/src/exams/exams.module.ts`
- Create: `backend/src/exams/dto/create-exam.dto.ts`
- Create: `backend/src/exams/dto/update-exam.dto.ts`
- Create: `backend/src/exams/exams.service.spec.ts`
- Create: `backend/src/exams/exams.e2e-spec.ts`

- [ ] **Step 1: Write failing authorization and lifecycle tests**

Cover: assigned teacher creates an exam; unassigned teacher receives 403; teacher cannot add a subject they do not teach in that class; draft can be edited; published exam rejects score mutation; publish requires at least one subject; withdrawal hides results; another tenant cannot address the exam ID.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- exams.service.spec.ts exams.e2e-spec.ts --runInBand`

Expected: failures because the module is absent.

- [ ] **Step 3: Implement tenant-scoped lifecycle methods**

Use a context object rather than request-body identity:

```ts
type ActorContext = {
  tenantId: string
  personId: string
  identityType: 'tch' | 'adm' | 'stu' | 'par'
}
```

Every lookup uses `{ id, tenantId }`. `assertTeachingAssignment` must query the synchronized `TeachingAssignment` row matching teacher, classroom and course before writes. Expose create/list/detail/update/publish/withdraw endpoints.

- [ ] **Step 4: Run tests**

Run: `npm test -- exams.service.spec.ts exams.e2e-spec.ts --runInBand`

Expected: all lifecycle and authorization cases pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/exams
git commit -m "feat: enforce examination lifecycle"
```

### Task 3: Add grid score entry and atomic CSV import

**Files:**
- Create: `backend/src/exams/dto/save-score-grid.dto.ts`
- Create: `backend/src/exams/score-entry.service.ts`
- Create: `backend/src/exams/score-entry.service.spec.ts`
- Create: `backend/src/exams/csv-import.service.ts`
- Create: `backend/src/exams/csv-import.service.spec.ts`
- Modify: `backend/src/exams/exams.controller.ts`

- [ ] **Step 1: Write failing score validation tests**

Cover unknown student, student outside the exam class, duplicate student/subject cell, negative score, score above maximum, absent student with a numeric score, comma/BOM CSV, duplicate CSV row, malformed numeric input, and all-or-nothing rollback.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- score-entry.service.spec.ts csv-import.service.spec.ts --runInBand`

Expected: failures because entry/import services are absent.

- [ ] **Step 3: Implement grid upsert and CSV validation**

Use a normalized command:

```ts
type ScoreCell = {
  studentEduplusId: string
  subjectId: string
  score: number | null
  absent: boolean
}
```

Validate every cell before starting the write transaction. CSV import first records a validation result and row errors; it applies no scores when any error exists. A successful import upserts the full validated set and marks the import `APPLIED` in the same transaction.

- [ ] **Step 4: Run tests**

Run: `npm test -- score-entry.service.spec.ts csv-import.service.spec.ts --runInBand`

Expected: PASS for validation and rollback cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/exams
git commit -m "feat: add score grid and csv import"
```

### Task 4: Calculate published results and role-scoped visibility

**Files:**
- Create: `backend/src/results/ranking.ts`
- Create: `backend/src/results/ranking.spec.ts`
- Create: `backend/src/results/results.service.ts`
- Create: `backend/src/results/results.service.spec.ts`
- Create: `backend/src/results/results.controller.ts`
- Create: `backend/src/results/results.module.ts`

- [ ] **Step 1: Write failing calculation and authorization tests**

Assert arithmetic mean, total, class rank, per-subject rank, equal-score competition ranking (`1, 2, 2, 4`), trend ordering by exam date, published-only visibility, student-self only, parent linked-child only, inactive relationship denial, and withdrawn result disappearance.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- ranking.spec.ts results.service.spec.ts --runInBand`

Expected: failures because ranking/results code is absent.

- [ ] **Step 3: Implement deterministic rankings and result queries**

```ts
export function competitionRanks(values: Array<{ id: string; value: number }>) {
  const sorted = [...values].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  let previousValue: number | undefined
  let previousRank = 0
  return sorted.map((row, index) => {
    const rank = previousValue === row.value ? previousRank : index + 1
    previousValue = row.value
    previousRank = rank
    return { ...row, rank }
  })
}
```

The service derives the current person from `ActorContext`; student and child IDs from URL parameters are validated against that context and stored relations before querying scores.

- [ ] **Step 4: Run tests**

Run: `npm test -- ranking.spec.ts results.service.spec.ts --runInBand`

Expected: all calculations and access boundaries pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/results
git commit -m "feat: publish role scoped examination results"
```

### Task 5: Build teacher examination screens

**Files:**
- Create: `frontend/src/exams/ExamListPage.tsx`
- Create: `frontend/src/exams/ExamEditorPage.tsx`
- Create: `frontend/src/exams/ScoreGridPage.tsx`
- Create: `frontend/src/exams/CsvImportPanel.tsx`
- Create: `frontend/src/exams/examApi.ts`
- Create: `frontend/src/exams/ScoreGridPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layout/AppShell.tsx`

- [ ] **Step 1: Write failing teacher-flow tests**

Test assignment-filtered selectors, custom exam type input, inline validation above maximum, save-draft state, CSV error table, publish confirmation, and withdrawal confirmation.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- --run src/exams`

Expected: failures because teacher components are absent.

- [ ] **Step 3: Implement the teacher flow**

Use Ant Design `Form`, `Table`, `InputNumber`, `Upload`, `Modal`, and status tags. Do not keep unsaved scores only inside table cell components; store a normalized `Record<studentId, Record<subjectId, ScoreCell>>` in the page reducer so validation and submission use the same state.

- [ ] **Step 4: Verify tests and build**

Run: `npm test -- --run src/exams`

Run: `npm run build`

Expected: PASS and successful production build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/exams frontend/src/App.tsx frontend/src/layout
git commit -m "feat: add teacher examination workspace"
```

### Task 6: Build student and parent result screens

**Files:**
- Create: `frontend/src/results/MyResultsPage.tsx`
- Create: `frontend/src/results/ChildResultsPage.tsx`
- Create: `frontend/src/results/ResultSummary.tsx`
- Create: `frontend/src/results/TrendChart.tsx`
- Create: `frontend/src/results/resultsApi.ts`
- Create: `frontend/src/results/results.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layout/AppShell.tsx`

- [ ] **Step 1: Write failing role-view tests**

Assert students see only “我的成绩”, parents see an authorized child selector, unlinked child IDs are not requested, unpublished/empty states are explicit, and summary cards display total, average, class rank and subject ranks.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- --run src/results`

Expected: failures because result pages are absent.

- [ ] **Step 3: Implement accessible responsive result views**

Render tabular values as real table semantics, pair chart colors with labels, and provide a textual trend summary. The client may hide unavailable navigation, but the backend remains the authorization boundary.

- [ ] **Step 4: Run complete domain verification**

Run from `backend`: `npm test -- --runInBand && npm run build`

Run from `frontend`: `npm test -- --run && npm run build`

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/results frontend/src/App.tsx frontend/src/layout
git commit -m "feat: add student and parent results"
```
