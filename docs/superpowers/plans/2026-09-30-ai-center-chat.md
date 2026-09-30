# AI Center Chat Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task. Independent frontend work may use superpowers:dispatching-parallel-agents. Run review before integration.

**Goal:** Add authenticated, non-streaming AI Center dialogue testing to widget-demo.

**Architecture:** React uses the existing cookie/CSRF request helper to reach a dedicated NestJS module. The backend validates the bounded text conversation, keeps API credentials server-side, calls standard AI Center Chat, and returns only safe response fields.

**Tech Stack:** NestJS 11, class-validator, native fetch, React 19, Ant Design, Jest/Supertest and Vitest/Testing Library.

## Task 1: Backend contract and validation

Files: create `backend/src/ai-center/ai-center.service.ts`, `chat.dto.ts`, `ai-center.controller.ts`, `ai-center.module.ts`, `ai-center.service.spec.ts`, `ai-center.e2e-spec.ts`, `backend/src/config/env.schema.spec.ts`; modify `backend/src/config/env.schema.ts`, `backend/src/app.module.ts`.

- [x] Write failing environment tests for optional configuration, valid origin normalization, rejected URL credentials/paths/query/fragment, blank defaults, and bounded timeout.
- [x] Write service tests for the exact standard API URL and Bearer/UUID headers, omission of unset model, configured/explicit model precedence, safe success projection and usage, missing config, upstream 400/401/403/429/503, malformed response, redirect rejection and timeout/network errors.
- [x] Write HTTP tests with real SessionGuard and a stub AuthService at the session lookup boundary. Assert unauthenticated 401, CSRF rejection, valid 200, blank/oversized/unknown input 400, and no upstream fetch for rejected input.

Example contract:

```ts
const input = { messages: [{ role: 'user', content: '你好' }] }
const output = {
  content: '你好！', model: 'default', request_id: 'request-1', finish_reason: 'stop',
  usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
}
```

- [x] Run `npm test -- --runInBand --runTestsByPath src/ai-center/ai-center.service.spec.ts src/ai-center/ai-center.e2e-spec.ts src/config/env.schema.spec.ts` in backend; confirm feature tests fail before implementation.
- [x] Implement DTO class-validator bounds; route-specific ValidationPipe with `forbidNonWhitelisted: true`; status and chat routes guarded by SessionGuard.
- [x] Add optional validated `AI_CENTER_BASE_URL`, `AI_CENTER_API_KEY`, `AI_CENTER_MODEL`, and timeout; register module.
- [x] Implement server-side fetch with `redirect: 'error'`, UUID request ID and timeout; static safe error mapping; allowlist result projection.
- [x] Re-run targeted backend tests and `npm run build`.

## Task 2: Frontend dialogue testing

Files: create `frontend/src/ai-center/aiCenterApi.ts`, `AiChatPage.tsx`, `AiChatPage.test.tsx`; modify `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/layout/AppShell.tsx`.

- [x] Write failing tests for missing config/status errors, successful reply and usage, multi-turn request, failures preserving input/history and diagnostic details, clearing, disabled submit during request, and authenticated role navigation.
- [x] Run `npm test -- --run src/ai-center src/App.test.tsx`; confirm expected failing assertions before implementation.
- [x] Define the shared HTTP shapes and call existing request helper:

```ts
export const aiCenterApi = {
  status: () => request<AiCenterStatus>('/ai-center/status'),
  chat: (input: ChatInput) => request<ChatResult>('/ai-center/chat', {
    method: 'POST', body: JSON.stringify(input),
  }),
}
```

- [x] Add Ant Design form, text-only history, request result metadata, safe error display and status retry. Keep successful turns only in history; disable duplicate sends.
- [x] Add `/ai-chat` for authenticated users and `AI 对话测试` navigation for all roles.
- [x] Re-run targeted Vitest and `npm run build`.

## Task 3: Configuration and delivery

Files: modify `backend/.env.example`, `deploy/k8s/secret.example.yaml`, `docs/sealos-deployment.md`; create `docs/ai-center-chat.md`.

- [x] Document server-side origin, optional model, Key/capability setup, timeout, default parameters, limits, endpoints, safe errors and session-only storage.
- [x] Add empty optional environment values; put only placeholder Key in Secret example. Deployment already loads ConfigMap and Secret via envFrom.
- [x] Run complete `npm test -- --runInBand` and `npm run build` in backend, `npm test -- --run` and `npm run build` in frontend, and `git diff --check`.
- [x] Review specification compliance first and code quality second; fix any material issues and repeat affected checks.
- [x] Deliver the reviewed change in the user's main checkout without publishing. Report real upstream integration and any database test limitations separately.


## Delivery verification (2026-09-30)

- Backend full Jest suite: 188 tests passed using an isolated local PostgreSQL with both DATABASE_URL and TEST_DATABASE_URL configured.
- Frontend full Vitest suite: 44 tests passed; backend and frontend production builds passed.
- Native HTTP smoke: real NestJS-to-fetch-to-local-fixture round trip, session/CSRF, response usage/request ID and SPA route passed.
- In-app browser at localhost verified first response and multi-turn history: input Tokens increased from 18 to 54 for three request messages.
- Specification compliance and code quality reviews approved. Reviews led to a configuration refresh action and rejection of blank upstream assistant responses, both covered by regression tests.
- No real AI Center Key used; no live upstream model call or deployment performed.
