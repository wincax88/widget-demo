# EduPlus Exam App Delivery Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Execute each linked plan with `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Complete plans in order; do not start a dependent plan before its predecessor passes its verification gate.

**Goal:** Deliver `widget-demo` as a subscribed, multi-tenant EduPlus examination-results application with full-app OAuth/OIDC login, public-API master-data sync, real Widget runtime data, and Sealos deployment.

**Architecture:** The work is split at deployable boundaries. First close the two EduPlus Widget protocol gaps. Then replace the demo backend with a tested NestJS integration foundation, implement the examination domain and role-based React UI, and finally connect real Widget endpoints and deploy the verified images to Sealos.

**Tech Stack:** Java 21, Keycloak 26 extension, React/TypeScript/Vitest, NestJS, Prisma, PostgreSQL, Jest, Docker, Kubernetes, Sealos

---

## Execution order

1. [EduPlus Widget protocol](2026-09-23-eduplus-widget-protocol-plan.md)
2. [NestJS integration foundation](2026-09-23-widget-demo-integration-foundation-plan.md)
3. [Examination domain and UI](2026-09-23-widget-demo-exam-domain-plan.md)
4. [Widget runtime and Sealos delivery](2026-09-23-widget-demo-widget-deployment-plan.md)

## Cross-plan gates

- [ ] Protocol plan passes backend, workbench, Keycloak-extension, OpenSpec, and documentation verification.
- [ ] Integration foundation can receive a signed subscription webhook, complete OIDC handoff, create an HttpOnly application session, and synchronize authorized directory data into PostgreSQL.
- [ ] Examination domain enforces teacher assignment, student self, and parent-child boundaries in service tests and HTTP tests.
- [ ] Widget runtime returns only real database data, rotates server-side refresh tokens, and passes a live tenant smoke test in Sealos.

