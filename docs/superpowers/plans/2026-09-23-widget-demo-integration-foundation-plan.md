# Widget Demo Integration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Java/Rust diagnostic backend with a production-shaped NestJS service that persists tenants and credentials, verifies EduPlus webhooks, establishes OIDC application sessions, and synchronizes authorized school master data.

**Architecture:** A single NestJS API owns PostgreSQL state through Prisma. Integration modules isolate Webhook, OAuth/OIDC, encrypted credentials, sessions, and EduPlus public-API access. The React application talks only to same-origin `/api`; all EduPlus tokens and secrets remain server-side.

**Tech Stack:** Node.js 22, NestJS, TypeScript, Prisma, PostgreSQL, Jest/Supertest, jose, React 19, Ant Design

---

### Task 1: Scaffold the NestJS backend with a health gate

**Files:**
- Delete after replacement passes: `backend/pom.xml`, `backend/mvnw`, `backend/mvnw.cmd`, `backend/src/**`
- Delete after replacement passes: `webhook-receiver-rust/**`
- Create: `backend/package.json`
- Create: `backend/package-lock.json`
- Create: `backend/nest-cli.json`
- Create: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/health/health.controller.ts`
- Create: `backend/src/health/health.controller.spec.ts`

- [ ] **Step 1: Create the failing health-controller test**

```ts
describe('HealthController', () => {
  it('returns a stable readiness payload', () => {
    expect(new HealthController().ready()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Install the locked NestJS toolchain and run the failing test**

Use dependencies `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `class-transformer`, `class-validator`, `cookie-parser`, `helmet`, `reflect-metadata`, `rxjs`; dev dependencies include Nest CLI, Jest, Supertest, ts-jest, TypeScript and Node/Jest types.

Run: `npm test -- --runInBand`

Expected: failure because `HealthController` does not exist.

- [ ] **Step 3: Implement bootstrap and health endpoint**

```ts
@Controller('health')
export class HealthController {
  @Get('ready')
  ready() {
    return { status: 'ok' }
  }
}
```

Bootstrap with `helmet`, JSON limit `1mb`, raw-body capture for `/api/webhooks/eduplus`, global validation with `whitelist: true`, and prefix `/api` except public Widget paths added in Plan 4.

- [ ] **Step 4: Verify and remove superseded backends**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: both pass. Only then remove the Java backend sources and Rust receiver, preserving their behavior references in Git history.

- [ ] **Step 5: Commit**

```bash
git add backend webhook-receiver-rust
git commit -m "build: replace demo backend with nestjs"
```

### Task 2: Define the PostgreSQL tenancy and integration schema

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202609230001_integration_foundation/migration.sql`
- Create: `backend/src/prisma/prisma.module.ts`
- Create: `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/config/env.schema.ts`
- Create: `backend/.env.example`
- Test: `backend/src/prisma/prisma.integration.spec.ts`

- [ ] **Step 1: Write the database isolation test**

Create two tenants with the same external person ID and assert both rows persist while `(tenantId, eduplusId)` remains unique within a tenant.

```ts
await prisma.person.createMany({ data: [
  { tenantId: tenantA.id, eduplusId: 'u-1', type: 'TEACHER', name: 'A' },
  { tenantId: tenantB.id, eduplusId: 'u-1', type: 'TEACHER', name: 'B' },
] })
expect(await prisma.person.count({ where: { eduplusId: 'u-1' } })).toBe(2)
```

- [ ] **Step 2: Define the initial Prisma models**

Create `Tenant`, `TenantCredential`, `WebhookReceipt`, `AppSession`, `DirectorySyncRun`, `Person`, `Classroom`, `Course`, `TeachingAssignment`, and `ParentStudentRelation`. Every projected business model must include `tenantId` and a composite uniqueness rule such as:

```prisma
model Person {
  id         String @id @default(uuid())
  tenantId   String
  eduplusId  String
  type       PersonType
  name       String
  active     Boolean @default(true)
  tenant     Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, eduplusId])
  @@index([tenantId, type, active])
}
```

Credential ciphertext, IV and authentication tag use separate byte columns; session rows store only a SHA-256 token hash, not the browser token.

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma format`

Run: `npx prisma generate`

Run: `npx prisma migrate dev --name integration_foundation`

Expected: migration applies to the configured development PostgreSQL.

- [ ] **Step 4: Run the integration test**

Run: `npm test -- prisma.integration.spec.ts --runInBand`

Expected: PASS with both tenant rows isolated.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma backend/src/prisma backend/src/config backend/.env.example backend/package.json backend/package-lock.json
git commit -m "feat: add tenant integration schema"
```

### Task 3: Verify webhooks and manage subscription credentials

**Files:**
- Create: `backend/src/integration/crypto/credential-crypto.service.ts`
- Create: `backend/src/integration/crypto/credential-crypto.service.spec.ts`
- Create: `backend/src/subscriptions/webhook-signature.service.ts`
- Create: `backend/src/subscriptions/webhook-signature.service.spec.ts`
- Create: `backend/src/subscriptions/subscriptions.service.ts`
- Create: `backend/src/subscriptions/subscriptions.controller.ts`
- Create: `backend/src/subscriptions/subscriptions.e2e-spec.ts`
- Create: `backend/src/subscriptions/subscriptions.module.ts`

- [ ] **Step 1: Write failing crypto and webhook tests**

Cover AES-256-GCM round-trip, ciphertext tampering, signature mismatch, timestamp older than 300 seconds, duplicated `event_id`, `subscription.created`, `subscription.suspended`, `credential.rotated`, and `credential.revoked`.

Use the canonical signature input documented by EduPlus:

```ts
const canonical = `${timestamp}.${eventName}.${rawBody.toString('utf8')}`
const expected = createHmac('sha256', webhookSecret).update(canonical).digest('base64url')
```

- [ ] **Step 2: Run the tests and observe failures**

Run: `npm test -- credential-crypto webhook-signature subscriptions --runInBand`

Expected: failures because services/controllers are absent.

- [ ] **Step 3: Implement verification and idempotent state transitions**

Use timing-safe signature comparison, reject timestamps outside five minutes, insert `WebhookReceipt.eventId` before mutation inside one transaction, encrypt every client secret, and make duplicate events return HTTP 200 without reapplying state.

Controller contract:

```ts
@Post('webhooks/eduplus')
@HttpCode(200)
receive(@Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string>) {
  return this.service.receive(request.rawBody!, headers)
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- credential-crypto webhook-signature subscriptions --runInBand`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/integration/crypto backend/src/subscriptions backend/prisma
git commit -m "feat: persist signed subscription webhooks"
```

### Task 4: Establish full-application OAuth/OIDC sessions

**Files:**
- Create: `backend/src/integration/eduplus/handoff-client.ts`
- Create: `backend/src/integration/eduplus/handoff-client.spec.ts`
- Create: `backend/src/integration/eduplus/oidc-verifier.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/session.guard.ts`
- Create: `backend/src/auth/auth.e2e-spec.ts`
- Create: `backend/src/auth/auth.module.ts`

- [ ] **Step 1: Write failing handoff and session tests**

Assert the HMAC canonical string is exactly `client_id + "\n" + code + "\n" + timestamp + "\n" + nonce`, the returned JWT validates issuer/client/tenant/identity, token mismatch creates no session, and a successful exchange sets only a random `HttpOnly; Secure; SameSite=Lax` cookie.

- [ ] **Step 2: Run tests and observe failures**

Run: `npm test -- handoff-client auth.e2e --runInBand`

Expected: failures because handoff exchange and sessions are absent.

- [ ] **Step 3: Implement application login and direct authorization-code callback**

Expose:

```text
POST /api/auth/handoff
GET  /api/auth/login/:tenantCode
GET  /api/auth/callback/:tenantCode
POST /api/auth/logout
GET  /api/session
```

Both handoff and authorization-code callback must pass through one `acceptOidcTokenResponse` method. Encrypt application refresh tokens in `AppSession`, hash the random cookie token, rotate refresh tokens server-side, and never return OIDC tokens in JSON.

- [ ] **Step 4: Run tests**

Run: `npm test -- handoff-client auth.e2e --runInBand`

Expected: all selected tests pass, including cookie and token-leak assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/src/integration/eduplus backend/src/auth backend/prisma
git commit -m "feat: establish eduplus oidc sessions"
```

### Task 5: Synchronize authorized school master data

**Files:**
- Create: `backend/src/directory-sync/eduplus-directory.client.ts`
- Create: `backend/src/directory-sync/directory-sync.service.ts`
- Create: `backend/src/directory-sync/directory-sync.controller.ts`
- Create: `backend/src/directory-sync/directory-sync.service.spec.ts`
- Create: `backend/src/directory-sync/directory-sync.module.ts`

- [ ] **Step 1: Write failing cursor, scope and idempotency tests**

Mock two cursor pages for staff, students, parents, classes, courses, assignments and parent-child relations. Assert no next page is skipped, an unauthorized upstream 403 aborts without widening scope, and rerunning the same snapshot updates rows instead of duplicating them.

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `npm test -- directory-sync.service.spec.ts --runInBand`

Expected: failure because the sync service is absent.

- [ ] **Step 3: Implement explicit manual synchronization**

Use a shared paginator:

```ts
async function collectPages<T>(load: (cursor?: string) => Promise<Page<T>>): Promise<T[]> {
  const result: T[] = []
  let cursor: string | undefined
  do {
    const page = await load(cursor)
    result.push(...page.items)
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return result
}
```

`POST /api/directory-sync` requires an active teacher/staff application session. Record start/end/status/counts in `DirectorySyncRun`; upsert by tenant plus EduPlus ID in one transaction per resource group. Do not schedule background impersonated-user sync.

- [ ] **Step 4: Run tests and build**

Run: `npm test -- directory-sync.service.spec.ts --runInBand`

Run: `npm run build`

Expected: PASS and successful TypeScript compilation.

- [ ] **Step 5: Commit**

```bash
git add backend/src/directory-sync backend/src/integration backend/prisma
git commit -m "feat: synchronize eduplus school directory"
```

### Task 6: Replace diagnostic frontend with an authenticated shell

**Files:**
- Delete: `frontend/src/pages/ConfigPage.tsx`
- Delete: `frontend/src/pages/ApiTesterPage.tsx`
- Delete: `frontend/src/pages/OAuthPage.tsx`
- Delete: `frontend/src/pages/EventsPage.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api.ts`
- Create: `frontend/src/auth/LaunchPage.tsx`
- Create: `frontend/src/auth/SessionProvider.tsx`
- Create: `frontend/src/layout/AppShell.tsx`
- Create: `frontend/src/pages/SyncPage.tsx`
- Create: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add Vitest and write failing route/session tests**

Assert the launch page posts handoff parameters then removes them from the URL, unauthenticated users see an EduPlus login action, and authenticated staff can open the synchronization page while students and parents cannot.

- [ ] **Step 2: Run the failing frontend tests**

Run: `npm test -- --run`

Expected: failure because the new shell and test runner are not present.

- [ ] **Step 3: Implement the session shell**

All API calls use `credentials: 'include'`; `request` must throw on non-2xx responses instead of blindly parsing them. Routes are driven by the server-returned active identity, not hardcoded local role switches.

- [ ] **Step 4: Verify frontend and backend foundation**

Run: `npm test -- --run`

Run: `npm run build`

Run from `backend`: `npm test -- --runInBand && npm run build`

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat: add authenticated exam app shell"
```

### Task 7: Enforce shared HTTP security and secret-leak regression tests

**Files:**
- Create: `backend/src/security/origin.guard.ts`
- Create: `backend/src/security/csrf.guard.ts`
- Create: `backend/src/security/security.module.ts`
- Create: `backend/src/security/security.e2e-spec.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write failing HTTP security tests**

Assert that state-changing application-session requests require a matching CSRF cookie/header pair, Widget routes reject unknown origins, CORS echoes only configured EduPlus/application origins, JSON-only routes reject form/simple requests, authentication and webhook endpoints enforce independent rate limits, and error/log serializers redact these keys: `authorization`, `cookie`, `client_secret`, `handoff_code`, `access_token`, `refresh_token`, `refresh_session_id`.

- [ ] **Step 2: Run the tests and observe failure**

Run: `npm test -- security.e2e-spec.ts --runInBand`

Expected: failures because the shared guards and redaction policy are absent.

- [ ] **Step 3: Implement the security module**

Register explicit origin allow-lists from validated environment variables, double-submit CSRF for cookie-authenticated writes, route-scoped rate limiters, a JSON content-type guard for public Widget writes, and a structured logger redaction list. Webhook signature verification remains its authentication boundary and must not be placed behind application-session CSRF.

- [ ] **Step 4: Run the complete foundation verification**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: every backend test passes and the build succeeds without exposing diagnostic endpoints.

- [ ] **Step 5: Commit**

```bash
git add backend/src/security backend/src/main.ts backend/src/app.module.ts
git commit -m "feat: harden integration http boundaries"
```
