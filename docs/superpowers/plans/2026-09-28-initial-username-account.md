# Initial Username Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interactive `repo create` asks for an initial username and password, then generated Custom Authentication apps create and accept that account.

**Architecture:** The CLI validates credentials and stores a salted scrypt hash in an ignored one-time bootstrap file. Generated APIs consume the file before listening; both generation strategies use username throughout authentication.

**Tech Stack:** TypeScript, Node crypto, Vitest, Prisma/Drizzle, Express/Fastify, React/Vue.

**Spec:** `docs/superpowers/specs/2026-09-28-initial-username-account-design.md`

## Global Constraints

- Credentials never appear in `repo.config.yaml`, managed state, source, logs, or shell arguments.
- The bootstrap file is mode `0600` and removed only after successful or already-complete seeding.
- Clerk and noninteractive creation keep existing behavior.
- Existing `PluginCore` working-tree changes are preserved.

## Review Focus

- Password mismatch fails before file generation.
- Database unavailable retains the bootstrap file for retry.
- Username collision does not overwrite an existing password.
- Running the API from a different working directory still finds the bootstrap file.
- Generated `.gitignore` excludes the bootstrap file.

---

### Task 1: CLI credential capture and bootstrap file

**Files:** `src/cli/main.ts`, `src/application/create-service.ts`, new credential helper, `tests/cli/recommended-wizard.test.ts`, new helper tests.

**Interfaces:** A validated `{ username, passwordHash }` value is passed to a one-time file writer after project creation. The terminal password prompt does not echo input.

- [ ] Write failing tests for Custom Authentication prompts, validation, and ignored hashed output.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement hidden prompt, normalization, scrypt hashing, and `0600` bootstrap file writer.
- [ ] Run focused tests and confirm pass.

### Task 2: Generated username authentication

**Files:** `src/execution/capabilities/auth-custom.ts`, `src/execution/capabilities/auth-custom-files.ts`, `src/execution/capabilities/auth-custom-frontend.ts`, `src/execution/templates/database.ts`, related generator tests.

**Interfaces:** User records and HTTP payloads use `{ id, username }`; scrypt hashes share one format with Task 1.

- [ ] Write failing tests asserting generated schema, routes, and forms use username in both generation strategies.
- [ ] Run focused tests and confirm expected failures.
- [ ] Update generated source templates and test expectations.
- [ ] Run focused tests and confirm pass.

### Task 3: One-time API bootstrap

**Files:** generated bootstrap template, `src/execution/capabilities/auth-custom.ts`, `src/execution/templates/backend.ts`, integration tests.

**Interfaces:** `bootstrapInitialUser()` reads the file relative to the generated root, inserts once, and unlinks after success; API calls it before listening.

- [ ] Write failing tests for successful seed, retry when DB is unavailable, duplicate username, and alternate working directory.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement bootstrap in both generation strategies.
- [ ] Run focused tests and confirm pass.

### Task 4: Documentation and end-to-end verification

**Files:** `README.md`, `docs/cli-create-wizard.md`, generated README copy, affected tests.

- [ ] Update the documented setup sequence and account behavior.
- [ ] Run `pnpm test`, `pnpm build`, and `pnpm lint`.
- [ ] Generate a temporary Custom Authentication repo and verify bootstrap login against PostgreSQL; remove the temporary repo and account afterward.
