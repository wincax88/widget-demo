# Widget Demo Runtime and Sealos Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve real examination Widgets through the EduPlus runtime contract, securely rotate Widget tokens, package the application, and deploy it with managed PostgreSQL to the Sealos Guangzhou cluster.

**Architecture:** Public Widget endpoints are a narrow NestJS module separate from full-app sessions. Initial auth verifies the EduPlus-signed `widget_data` response and stores its refresh token in an encrypted, context-bound server session. Batch requests derive authorization exclusively from the verified access token. One container serves the API and built React assets behind a single HTTPS origin.

**Tech Stack:** NestJS, Prisma/PostgreSQL, jose/JWKS, React/Vite, Docker, Kubernetes, Sealos

---

### Task 1: Define real examination Widget schemas

**Files:**
- Create: `backend/src/widgets/widget-catalog.ts`
- Create: `backend/src/widgets/widget-catalog.spec.ts`
- Create: `backend/src/widgets/widgets.controller.ts`
- Create: `backend/src/widgets/widgets.module.ts`

- [ ] **Step 1: Write failing schema tests**

Assert stable unique keys, supported template types, relative diagnostic `data_source.url`, refresh intervals of at least 30 seconds, valid field paths, and applicable roles. Use three Widgets:

```text
exam-latest-summary   stat-card   student,parent
exam-score-table      table       teacher,student,parent
exam-score-trend      timeline    student,parent
```

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- widget-catalog.spec.ts --runInBand`

Expected: failure because the catalog is absent.

- [ ] **Step 3: Implement `GET /v1/open/demo-school/widgets/schema`**

Return `schema_version`, `generated_at`, and the three catalog entries. Diagnostic URLs return structurally valid, explicitly sandboxed/empty data and never query a real tenant without Widget authorization.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- widget-catalog.spec.ts --runInBand`

```bash
git add backend/src/widgets
git commit -m "feat: publish examination widget schemas"
```

### Task 2: Persist encrypted Widget refresh sessions

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202609230003_widget_refresh_sessions/migration.sql`
- Create: `backend/src/widgets/widget-refresh-session.service.ts`
- Create: `backend/src/widgets/widget-refresh-session.service.spec.ts`

- [ ] **Step 1: Write failing session tests**

Cover opaque ID generation, encrypted refresh-token round-trip, access-token hash binding, tenant/user/identity/app/config/endpoint binding, expiry, revocation and atomic token rotation. Assert the database never stores plaintext access or refresh tokens.

- [ ] **Step 2: Add the model**

```prisma
model WidgetRefreshSession {
  id                    String   @id @default(uuid())
  tenantId              String
  userId                String
  identityType          String
  appCode               String
  configSnapshotId      String
  accessTokenHash       String
  refreshTokenCiphertext Bytes
  refreshTokenIv        Bytes
  refreshTokenTag       Bytes
  authorizationJson     Json
  expiresAt             DateTime
  revokedAt             DateTime?
  @@index([tenantId, userId, appCode, expiresAt])
}
```

- [ ] **Step 3: Generate migration and implement compare-and-swap rotation**

Rotation updates only when `id`, previous `accessTokenHash`, and `revokedAt=null` match. A concurrent loser returns `SESSION_CONFLICT` and never overwrites the winner’s rotated token.

- [ ] **Step 4: Run tests and commit**

Run: `npx prisma migrate dev --name widget_refresh_sessions`

Run: `npm test -- widget-refresh-session.service.spec.ts --runInBand`

```bash
git add backend/prisma backend/src/widgets
git commit -m "feat: persist widget refresh sessions"
```

### Task 3: Implement Widget auth and refresh endpoints

**Files:**
- Create: `backend/src/widgets/widget-auth.service.ts`
- Create: `backend/src/widgets/widget-auth.service.spec.ts`
- Create: `backend/src/widgets/widget-auth.e2e-spec.ts`
- Modify: `backend/src/widgets/widgets.controller.ts`

- [ ] **Step 1: Write failing auth/refresh tests**

Cover missing or unknown client ID, HMAC exchange body, idempotency-key replay, issuer/audience/scope/`handoff_type` verification, endpoint-key extraction, refresh-token non-leakage, wrong current access token, cross-context session ID, expired session, rotation and `Cache-Control: no-store`.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- widget-auth --runInBand`

Expected: failure because auth endpoints are absent.

- [ ] **Step 3: Implement the public contracts**

```text
POST /v1/open/demo-school/widgets/auth
POST /v1/open/demo-school/widgets/token/refresh
```

Auth accepts only `grant_type`, `client_id`, `handoff_code`, and `idempotency_key`. It selects the encrypted credential by exact client ID, exchanges the code, verifies the returned JWT, stores the refresh token, and returns:

```json
{
  "access_token": "eduplus-signed-widget-token",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "widget.data.read",
  "refresh_session_id": "opaque-uuid",
  "refresh_after": 240
}
```

Refresh validates the current bearer token even within the documented short expiry grace window, loads the exact session, calls the Keycloak token endpoint with `grant_type=refresh_token`, verifies the new token did not widen claims, and atomically stores the rotated refresh token.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- widget-auth --runInBand`

```bash
git add backend/src/widgets
git commit -m "feat: exchange and refresh widget tokens"
```

### Task 4: Implement authorized batch examination data

**Files:**
- Create: `backend/src/widgets/widget-data.service.ts`
- Create: `backend/src/widgets/widget-data.service.spec.ts`
- Create: `backend/src/widgets/widget-batch.e2e-spec.ts`
- Modify: `backend/src/widgets/widgets.controller.ts`

- [ ] **Step 1: Write failing batch tests**

Cover request shape `widgets[]`, unlisted widget/endpoint, invalid params, teacher assignment visibility, student-self data, parent linked-child data, unpublished/withdrawn exclusion, one-widget failure isolation, and cross-tenant rejection. Assert no mock fallback appears when the database is empty.

- [ ] **Step 2: Run tests and observe failure**

Run: `npm test -- widget-data widget-batch --runInBand`

Expected: failure because batch data is absent.

- [ ] **Step 3: Implement `POST /v1/open/demo-school/widgets/batch-data`**

Verify the EduPlus JWT and derive tenant, user, identity, `widget_keys`, `data_endpoint_keys`, and endpoint pairs from claims. Validate each request item against a server-owned params schema. Return independent entries:

```ts
type WidgetResult =
  | { status: 'ok'; data: unknown }
  | { status: 'error'; error: { code: string; message: string } }
```

Use the examination/results services rather than duplicate ranking or authorization logic.

- [ ] **Step 4: Run full backend verification and commit**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: all backend tests and build pass.

```bash
git add backend/src/widgets
git commit -m "feat: serve authorized examination widgets"
```

### Task 5: Package a single production image

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `backend/src/main.ts`
- Modify: `frontend/vite.config.ts`
- Create: `deploy/k8s/configmap.yaml`
- Create: `deploy/k8s/secret.example.yaml`
- Create: `deploy/k8s/deployment.yaml`
- Create: `deploy/k8s/service.yaml`
- Create: `deploy/k8s/ingress.yaml`

- [ ] **Step 1: Add a container smoke-test script**

Create an npm script that starts the compiled server, waits for `/api/health/ready`, checks the frontend `/`, and exits non-zero if either response fails.

- [ ] **Step 2: Implement a multi-stage build**

Build frontend and backend in separate Node 22 stages. The runtime stage contains production backend dependencies, Prisma engine/schema/migrations, compiled API, and frontend `dist`. Serve SPA assets from NestJS while excluding `/api` and `/v1/open` routes.

- [ ] **Step 3: Build and run locally**

Run: `docker build -t widget-demo:local .`

Run: `docker run --rm -p 8080:8080 --env-file backend/.env.test widget-demo:local`

Expected: container becomes ready; `/api/health/ready` returns `{"status":"ok"}` and `/` returns the application shell.

- [ ] **Step 4: Commit packaging**

```bash
git add Dockerfile .dockerignore backend frontend deploy
git commit -m "build: package widget demo for kubernetes"
```

### Task 6: Provision Sealos PostgreSQL and deploy

**Files:**
- Modify with real non-secret host names only: `deploy/k8s/configmap.yaml`
- Create locally but never commit: `deploy/k8s/secret.yaml`
- Modify: `README.md`

- [ ] **Step 1: Inspect the exact target before mutation**

Run:

```powershell
kubectl --kubeconfig 'C:\Users\Admin\Documents\基座\WidgetDemo\kubeconfig.yaml' config current-context
kubectl --kubeconfig 'C:\Users\Admin\Documents\基座\WidgetDemo\kubeconfig.yaml' get namespace ns-gc40gxwh
kubectl --kubeconfig 'C:\Users\Admin\Documents\基座\WidgetDemo\kubeconfig.yaml' -n ns-gc40gxwh get all,ingress,secret,configmap
```

Expected: the configured cluster is `gzg.sealos.run`, namespace exists, and no unrelated resource will be replaced.

- [ ] **Step 2: Create a Sealos managed PostgreSQL instance**

Use the Sealos database UI/API in the Guangzhou region, capture host/port/database/user/password into the uncommitted Kubernetes Secret, and require TLS when the managed endpoint supports it. Do not deploy a PostgreSQL StatefulSet.

- [ ] **Step 3: Push the verified image and apply manifests**

Set an immutable image tag containing the Git SHA. Apply Secret, ConfigMap, migration Job if separated, Deployment, Service, and Ingress with the provided kubeconfig and explicit namespace.

Run: `kubectl --kubeconfig 'C:\Users\Admin\Documents\基座\WidgetDemo\kubeconfig.yaml' -n ns-gc40gxwh rollout status deployment/widget-demo --timeout=180s`

Expected: rollout completes successfully and all pods are Ready.

- [ ] **Step 4: Perform live protocol smoke tests**

Verify HTTPS health and schema endpoints, register the application environment URLs in EduPlus, deliver a real subscription webhook, open the full application through workbench handoff, synchronize one authorized tenant, publish a small real examination, and confirm teacher/student/parent Widget batches. Wait past `refresh_after` and confirm the workbench obtains a new access token without receiving a refresh token.

- [ ] **Step 5: Document operations and commit only non-secret material**

Document image tag, namespace, host, migration command, rollback command, required Secret keys, application registration URLs, and smoke-test results. Confirm `deploy/k8s/secret.yaml`, kubeconfig and credentials are absent from `git status`.

```bash
git add README.md deploy/k8s
git commit -m "docs: add sealos deployment runbook"
```
