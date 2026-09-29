# Initial Username Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interactive `repo create` displays the fixed username `admin` and asks for its password, then generated Custom Authentication apps create and accept that account.

**Architecture:** The CLI validates credentials and stores a salted scrypt hash in an ignored one-time bootstrap file. Generated APIs consume the file before listening; both generation strategies use username throughout authentication.

**Tech Stack:** TypeScript, Node crypto, Vitest, Prisma/Drizzle, Express/Fastify, React/Vue.

**Spec:** `docs/superpowers/specs/2026-09-28-initial-username-account-design.md`

## Global Constraints

- Plain passwords and password hashes never appear in `repo.config.yaml`, managed state, source, logs, or shell arguments; the CLI displays the fixed username `admin`.
- The bootstrap file is mode `0600` and removed only after successful or already-complete seeding.
- Clerk and noninteractive creation keep existing behavior.
- Existing `PluginCore` working-tree changes are preserved.

## Review Focus

- Invalid or mismatched passwords prompt again before file generation.
- Database unavailable retains the bootstrap file for retry.
- Username collision does not overwrite an existing password.
- Running the API from a different working directory still finds the bootstrap file.
- Generated `.gitignore` excludes the bootstrap file.

---

### Task 1: CLI credential capture and bootstrap file

**Files:** `src/cli/main.ts`, `src/application/create-service.ts`, new credential helper, `tests/cli/recommended-wizard.test.ts`, new helper tests.

**Interfaces:** A validated `{ username, passwordHash }` value is passed to a one-time file writer after project creation. The terminal password prompt does not echo input.

- [x] Write failing tests for Custom Authentication prompts, validation, and ignored hashed output.
- [x] Run focused tests and confirm expected failures.
- [x] Implement hidden prompt, scrypt hashing, and `0600` bootstrap file writer.
- [x] Run focused tests and confirm pass.

### Task 2: Generated username authentication

**Files:** `src/execution/capabilities/auth-custom.ts`, `src/execution/capabilities/auth-custom-files.ts`, `src/execution/capabilities/auth-custom-frontend.ts`, `src/execution/templates/database.ts`, related generator tests.

**Interfaces:** User records and HTTP payloads use `{ id, username }`; scrypt hashes share one format with Task 1.

- [x] Write failing tests asserting generated schema, routes, and forms use username in both generation strategies.
- [x] Run focused tests and confirm expected failures.
- [x] Update generated source templates and test expectations.
- [x] Run focused tests and confirm pass.

### Task 3: One-time API bootstrap

**Files:** generated bootstrap template, `src/execution/capabilities/auth-custom.ts`, `src/execution/templates/backend.ts`, integration tests.

**Interfaces:** `bootstrapInitialUser()` reads the file relative to the generated root, inserts once, and unlinks after success; API calls it before listening.

- [x] Write failing tests for successful seed, retry when DB is unavailable, duplicate username, and alternate working directory.
- [x] Run focused tests and confirm expected failures.
- [x] Implement bootstrap in both generation strategies.
- [x] Run focused tests and confirm pass.

### Task 4: Documentation and end-to-end verification

**Files:** `README.md`, `docs/cli-create-wizard.md`, generated README copy, affected tests.

- [x] Update the documented setup sequence and account behavior.
- [x] Run `pnpm test`, `pnpm build`, and `pnpm lint`.
- [x] Generate temporary Recommended and Custom Authentication repos, verify bootstrap login against PostgreSQL, and remove temporary repos and database afterward.

## Verification record (2026-09-29)

- `pnpm test`: 209 tests passed after the final prompt validation changes; `pnpm lint`, `pnpm typecheck` and `pnpm build` passed.
- Generated Recommended React/Express/Prisma and Custom Vue/Fastify/Drizzle API/Web builds passed. Recommended API tests passed (2/2).
- In a real PTY, the Custom Authentication wizard prompted for the initial username and two hidden passwords; the transcript contained no password and the bootstrap file was created.
- A temporary PostgreSQL 18 cluster in `/tmp` confirmed schema setup, initial login and bootstrap-file removal for both generators. Starting the Custom API from the repository root also succeeded. Repeating bootstrap for an existing username preserved its original password and removed the one-time file. The temporary cluster and generated repos were removed.

## Wizard correction (2026-09-29)

- [x] Fix the bootstrap username to `admin` and display `Admin username: admin` in the CLI.
- [x] Repeat the hidden password and confirmation prompts after a length or mismatch error; create the project only after valid input.
- [x] Update the wizard, bootstrap, and documentation tests for the corrected flow.

The verification record above describes the original variable-username flow. For the corrected flow, focused wizard and bootstrap tests passed (18/18). The full suite passed (208/208), as did `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
