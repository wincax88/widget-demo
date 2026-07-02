# Repository Guidelines

## Project Structure & Module Organization

This repository contains an EduPlus third-party integration demo with three runnable parts. `backend/` is a Java 21 Spring Boot service; source lives under `backend/src/main/java/com/eduplus/demo`, resources under `backend/src/main/resources`, and tests under `backend/src/test/java`. `frontend/` is a React 19 + TypeScript + Vite app; pages are in `frontend/src/pages`, API helpers in `frontend/src/services`, and shared types in `frontend/src/types`. `webhook-receiver-rust/` is an Axum-based Rust webhook receiver with its entry point in `src/main.rs`. Root files such as `README.md`, `TEST-REPORT.md`, and `ecosystem.config.cjs` document and orchestrate the demo.

## Build, Test, and Development Commands

- `cd backend; .\mvnw.cmd spring-boot:run` starts the Spring Boot API on port `8888`.
- `cd backend; .\mvnw.cmd test` runs backend JUnit/Spring tests.
- `cd frontend; npm install` installs frontend dependencies from `package-lock.json`.
- `cd frontend; npm run dev` starts Vite on port `3088`.
- `cd frontend; npm run build` type-checks with `tsc -b` and builds the frontend.
- `cd webhook-receiver-rust; cargo run --release` runs the Rust receiver on port `3099`.
- `cd webhook-receiver-rust; cargo test` runs Rust tests when present.

## Coding Style & Naming Conventions

Use existing style in each module. Java classes use package `com.eduplus.demo`, PascalCase class names, camelCase methods, and four-space indentation. TypeScript uses PascalCase React components, camelCase variables, extension `.tsx` for components, and two-space indentation. Rust uses standard `rustfmt` conventions, snake_case functions, and descriptive serde field names matching API payloads. Keep route paths and widget keys stable unless coordinating backend, frontend, and documentation updates together.

## Testing Guidelines

Backend tests use JUnit 5, Spring Boot Test, and MockMvc; name test classes `*Test` and methods by behavior, for example `schemaDiscoveryReturnsFourWidgetTypes`. Add focused tests for webhook verification, token flows, and widget API changes. The frontend currently has no test runner configured, so rely on `npm run build` plus manual browser checks for UI changes. Run `cargo test` and `cargo fmt --check` for Rust changes.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use clear, imperative commit subjects such as `Add widget auth validation` or `Fix frontend config form`. Keep commits scoped to one module or behavior when possible. Pull requests should include a short summary, affected module list, verification commands run, linked issues, and screenshots for visible frontend changes. Never include real EduPlus secrets, OAuth credentials, or production webhook signing keys in commits.
