# EduPlus Widget Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EduPlus Widget handoff usable by a multi-tenant third-party backend by exposing the selected public `client_id` and issuing a server-only refresh token for `widget_data` exchanges.

**Architecture:** Extend existing runtime metadata without changing built-in Widgets or `app_launch`. The workbench forwards only the backend-selected public client ID to the controlled third-party auth URL. Keycloak continues signing Widget access tokens and now issues a refresh token whose session notes preserve the original Widget authorization boundary.

**Tech Stack:** Spring Boot/Java 21, Redis handoff context, React/TypeScript/Vitest, Keycloak 26 extension/JUnit, OpenSpec

---

### Task 1: Reconcile the active OpenSpec change

**Files:**
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/design.md`
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/tasks.md`
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/specs/workbench/spec.md`
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/specs/workbench-handoff/spec.md`
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/specs/keycloak-token-claims/spec.md`

- [ ] **Step 1: Add the failing protocol scenarios before code changes**

Add scenarios requiring `third_party_handoffs[].client_id`, exact binding to the credential stored in the handoff context, a refresh token in the server-to-server `widget_data` exchange, and absence of refresh tokens in browser-facing responses. Use this normative wording:

```markdown
#### Scenario: Widget handoff exposes the selected public client identifier
- **WHEN** the backend creates a `widget_data` handoff with OAuth credential `oc_tenant_a`
- **THEN** the matching runtime handoff metadata SHALL contain `client_id=oc_tenant_a`
- **AND** the handoff context and token exchange SHALL reject any different client ID

#### Scenario: Widget exchange supports server-side refresh
- **WHEN** an authenticated third-party backend exchanges a valid `widget_data` handoff code
- **THEN** the OIDC token response SHALL contain a refresh token bound to the same user session and Widget authorization notes
- **AND** no workbench-facing response SHALL expose that refresh token
```

- [ ] **Step 2: Update the design and task checklist**

Document the two independent token lifecycles (`app_launch` and `widget_data`), refresh-token rotation, and the fact that `client_id` is public while `client_secret` remains server-only. Add explicit implementation tasks for backend DTO/service, workbench forwarding, Keycloak issuance, tests, and docs.

- [ ] **Step 3: Validate the change**

Run: `openspec.cmd validate add-third-party-widget-runtime-auth --strict`

Expected: exit code `0` and no schema or scenario errors.

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/add-third-party-widget-runtime-auth
git commit -m "docs: define widget client and refresh contract"
```

### Task 2: Return the selected client ID in runtime metadata

**Files:**
- Modify: `../edu-plus-2/backend/src/main/java/com/eduplus/module/workbench/dto/widget/ThirdPartyWidgetHandoffResponse.java`
- Modify: `../edu-plus-2/backend/src/main/java/com/eduplus/module/workbench/service/WorkbenchWidgetRuntimeService.java`
- Modify: `../edu-plus-2/backend/src/test/java/com/eduplus/module/workbench/service/WorkbenchWidgetRuntimeServiceTest.java`

- [ ] **Step 1: Write failing service tests**

Add assertions that the response exposes the same credential chosen during handoff creation and that unsubscribed or incompletely configured apps still produce no usable handoff:

```java
assertThat(response.getThirdPartyHandoffs()).singleElement().satisfies(handoff -> {
    assertThat(handoff.getClientId()).isEqualTo("oc_tenant_a");
    assertThat(handoff.getHandoffCode()).isNotBlank();
});
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `mvn.cmd -Dtest=WorkbenchWidgetRuntimeServiceTest test`

Expected: compilation or assertion failure because `clientId` is not exposed.

- [ ] **Step 3: Add the DTO field and populate it from the resolved credential**

Add:

```java
private String clientId;
```

When building `ThirdPartyWidgetHandoffResponse`, use the exact `clientId` already selected for `createWidgetDataHandoffCode`; do not perform a second credential lookup and do not accept a browser-provided value.

- [ ] **Step 4: Run the backend tests**

Run: `mvn.cmd -Dtest=WorkbenchWidgetRuntimeServiceTest,AppHandoffServiceTest test`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/eduplus/module/workbench backend/src/test/java/com/eduplus/module/workbench
git commit -m "feat: expose widget handoff client id"
```

### Task 3: Forward client ID through the workbench

**Files:**
- Modify: `../edu-plus-2/frontend/workbench/src/types/thirdPartyWidgetRuntime.ts`
- Modify: `../edu-plus-2/frontend/workbench/src/services/thirdPartyWidgetRuntime.service.ts`
- Modify: `../edu-plus-2/frontend/workbench/src/services/thirdPartyWidgetRuntime.service.test.ts`
- Modify: `../edu-plus-2/frontend/workbench/src/hooks/useThirdPartyWidgetRuntime.ts`
- Modify: `../edu-plus-2/frontend/workbench/src/hooks/__tests__/useThirdPartyWidgetRuntime.test.ts`

- [ ] **Step 1: Write failing request-contract tests**

Assert that auth receives and forwards the metadata client ID:

```ts
await requestThirdPartyAuth(authUrl, 'oc_tenant_a', 'handoff-code')
expect(fetchMock).toHaveBeenCalledWith(authUrl, expect.objectContaining({
  body: expect.stringContaining('"client_id":"oc_tenant_a"'),
}))
```

Also assert that missing `client_id` disables only that third-party app and never falls back to schema or URL input.

- [ ] **Step 2: Run the focused tests and observe failure**

Run: `npm run test:run -- src/services/thirdPartyWidgetRuntime.service.test.ts src/hooks/__tests__/useThirdPartyWidgetRuntime.test.ts`

Expected: failure because the type and auth function do not accept `client_id`.

- [ ] **Step 3: Implement the additive contract**

Use these signatures:

```ts
export interface ThirdPartyWidgetHandoff {
  app_code: string
  client_id: string
  handoff_code: string
  // existing fields remain unchanged
}

export async function requestThirdPartyAuth(
  authUrl: string,
  clientId: string,
  handoffCode: string,
): Promise<ThirdPartyTokenState>
```

The JSON body must contain only `grant_type`, `client_id`, `handoff_code`, and a generated `idempotency_key`.

- [ ] **Step 4: Run focused tests and build**

Run: `npm run test:run -- src/services/thirdPartyWidgetRuntime.service.test.ts src/hooks/__tests__/useThirdPartyWidgetRuntime.test.ts`

Run: `npm run build`

Expected: tests pass and TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/workbench/src/types frontend/workbench/src/services frontend/workbench/src/hooks
git commit -m "feat: forward widget oauth client id"
```

### Task 4: Issue refresh tokens for widget_data

**Files:**
- Modify: `../edu-plus-2/keycloak-extensions/eduplus-mfa-authenticators/src/main/java/com/eduplus/keycloak/handoff/EduPlusHandoffGrantType.java`
- Modify: `../edu-plus-2/keycloak-extensions/eduplus-mfa-authenticators/src/test/java/com/eduplus/keycloak/handoff/EduPlusHandoffGrantTypeTest.java`

- [ ] **Step 1: Replace the old negative test with boundary tests**

```java
@Test
void issuesRefreshTokenForWidgetDataWhenClientAllowsRefresh() throws Exception {
    JsonNode payload = OBJECT_MAPPER.readTree("{\"handoff_type\":\"widget_data\"}");
    assertThat(EduPlusHandoffGrantType.shouldIssueRefreshToken(payload, true)).isTrue();
}

@Test
void doesNotIssueRefreshTokenWhenClientDisablesRefresh() throws Exception {
    JsonNode payload = OBJECT_MAPPER.readTree("{\"handoff_type\":\"widget_data\"}");
    assertThat(EduPlusHandoffGrantType.shouldIssueRefreshToken(payload, false)).isFalse();
}
```

Keep the existing `app_launch` behavior test.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `mvn.cmd -Dtest=EduPlusHandoffGrantTypeTest test`

Expected: the first new test fails because widget-data refresh is explicitly suppressed.

- [ ] **Step 3: Make issuance follow the OAuth client policy**

Implement:

```java
static boolean shouldIssueRefreshToken(JsonNode payload, boolean clientUsesRefreshToken) {
    return clientUsesRefreshToken;
}
```

Do not remove Widget session notes; Keycloak refresh must preserve `handoff_type`, tenant, application, configuration snapshot, Widget keys, endpoint keys, and endpoint pairs from the persistent user session.

- [ ] **Step 4: Run extension tests and package**

Run: `mvn.cmd -Dtest=EduPlusHandoffGrantTypeTest test`

Run: `mvn.cmd -DskipTests package`

Expected: tests pass and the extension JAR is produced.

- [ ] **Step 5: Commit**

```bash
git add keycloak-extensions/eduplus-mfa-authenticators
git commit -m "feat: enable widget token refresh"
```

### Task 5: Document and verify the protocol

**Files:**
- Modify: `../edu-plus-2/docs-site/docs/widget/data-api.md`
- Modify: `../edu-plus-2/docs/widget-third-party-data-auth-plan.md`
- Modify: `../edu-plus-2/openspec/changes/add-third-party-widget-runtime-auth/tasks.md`

- [ ] **Step 1: Update public examples**

Add `client_id` to `third_party_handoffs` and the browser-to-third-party auth request. Explicitly state that `/api/v1/app-handoff/token` may return a refresh token only to the third-party backend, while the third-party response to the workbench contains only `access_token` and opaque `refresh_session_id`.

- [ ] **Step 2: Run protocol verification**

Run: `openspec.cmd validate add-third-party-widget-runtime-auth --strict`

Run: `mvn.cmd -Dtest=WorkbenchWidgetRuntimeServiceTest,AppHandoffServiceTest test` from `../edu-plus-2/backend`.

Run: `npm run test:run -- src/services/thirdPartyWidgetRuntime.service.test.ts src/hooks/__tests__/useThirdPartyWidgetRuntime.test.ts` from `../edu-plus-2/frontend/workbench`.

Run: `mvn.cmd -Dtest=EduPlusHandoffGrantTypeTest test` from `../edu-plus-2/keycloak-extensions/eduplus-mfa-authenticators`.

Expected: every command exits `0`.

- [ ] **Step 3: Mark only completed OpenSpec tasks complete and commit**

```bash
git add docs docs-site openspec/changes/add-third-party-widget-runtime-auth
git commit -m "docs: publish widget refresh contract"
```

