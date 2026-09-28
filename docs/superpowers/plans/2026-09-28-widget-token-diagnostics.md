# Widget token response diagnostics implementation plan

> **For agentic workers:** Execute inline using the executing-plans and test-driven-development skills. Only widget-demo is in scope; the user approved diagnostic changes and redeployment.

**Goal:** Identify the field or response-shape mismatch behind `EduPlus returned an incomplete token response` without exposing credentials or weakening token verification.

**Architecture:** Keep the existing handoff exchange and its required token fields. On an invalid successful response, emit a fixed-schema warning and return the same 502 message with a non-sensitive diagnostic code, invalid field names, field types, and response shape. Never log response values, arbitrary response keys, request bodies, handoff codes, signatures, or tokens. Do not automatically accept wrapped responses or omit refresh-token validation without evidence.

**Tech Stack:** NestJS, TypeScript, Jest, GitHub Actions, Kubernetes.

## 1. Test first

Files: `backend/src/integration/eduplus/handoff-client.spec.ts`.

- [x] Verify the existing three tests pass: `npm test -- --runInBand integration/eduplus/handoff-client.spec.ts` in `backend`.
- [x] Add cases for missing refresh token, incorrectly typed expiry, a data-wrapped token response, and null/array payloads.
- [x] Each case must reject with 502 and a fixed diagnostic structure such as:

```typescript
expect(error.getResponse()).toMatchObject({
  code: 'EDUPLUS_TOKEN_RESPONSE_INCOMPLETE',
  invalid_fields: ['refresh_token'],
  field_types: { access_token_type: 'string', refresh_token_type: 'undefined', expires_in_type: 'number' },
  response_shape: 'object',
})
```

- [x] Spy on the logger only to capture actual emitted output; assert neither the response nor warning includes test access/refresh tokens, client secret, handoff code, or arbitrary upstream values.
- [x] Verify the diagnostic types remain visible after the application's recursive redactor, using safe `*_type` keys without changing token redaction.
- [x] Run the focused suite and verify these new assertions fail against the unchanged implementation.

## 2. Minimal implementation

File: `backend/src/integration/eduplus/handoff-client.ts`.

- [x] Parse the response as unknown. Treat only a non-null, non-array object as the token record.
- [x] Determine types for the fixed fields `access_token`, `refresh_token`, and `expires_in`; keep the original string/string/number checks.
- [x] On mismatch, warn with event `eduplus.handoff.token_response_incomplete` and the fixed diagnostic fields. Return a `BadGatewayException` retaining the original message plus the same diagnostic fields.
- [x] Record only whether a non-array `data` object contains token fields; do not unwrap it or log its contents.
- [x] Re-run focused tests, widget auth tests, and `npm run build`. Full backend suite: 29 suites / 119 tests passed against the local test database; build passed.

## 3. Deploy and reproduce

- [x] Review the exact diff and use a Chinese commit message. Independent review cleared the safe diagnostic field names and redactor regression tests.
- [ ] Fast-forward the clean main branch to the verified fix and push main; the existing Sealos workflow runs full tests and deploys the immutable commit-tagged image.
- [ ] Verify the workflow, Deployment image, Pod readiness, and public readiness endpoint.
- [ ] Ask the user to refresh the parent workbench to generate a fresh handoff request; inspect only the new fixed-schema diagnostic log.
- [ ] Explain the evidenced root cause. If the remedy requires edu-plus-2 or Keycloak changes, stop and request that authority instead of expanding scope.

Rollback, if deployment regresses: restore `ghcr.io/wincax88/widget-demo:990a8e326c00f732b865e3b805289a7ea03a72aa`; no database schema changes are introduced.
