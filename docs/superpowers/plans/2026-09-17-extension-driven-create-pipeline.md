# Extension-Driven Create Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `repo create` into a registry-driven resolver → planner → executor pipeline while preserving current CLI behavior and monorepo output.

**Architecture:** `src/cli/main.ts` continues to own prompts and presentation. `src/application/create-service.ts` becomes a compatibility facade/orchestrator; pure composition resolution moves under `src/core/resolver`, execution planning becomes explicit typed data, and generation is dispatched through focused execution services. Technology-specific auth/agent generation is then extracted behind capability/adapter boundaries.

**Tech Stack:** TypeScript 5.9, Node.js >=20, pnpm, Zod 4, YAML, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-17-extension-driven-create-pipeline-design.md`

## Global Constraints

- Preserve `repo create`, `repo info`, and `repo doctor` UX unless the spec explicitly changes a boundary.
- No production change is added without a failing Vitest test first.
- `RepoConfigSchema.parse()` must validate every generated config before any config write.
- Core/Application generic modules must not gain new framework/provider-specific branches.
- Each task leaves `pnpm test` and `pnpm typecheck` green before the next task.

---

### Task 1: Extract pure composition resolution

**Files:**
- Create: `src/core/resolver/create-resolver.ts`
- Modify: `src/application/create-service.ts`
- Modify: `src/core/resolver/contracts.ts`
- Test: `tests/core/resolver/create-resolver.test.ts`
- Test: `tests/application/create-service.test.ts`

**Interfaces:**
- Produces: `resolveCreateComposition(input: CreateResolutionInput): CreateResolutionPlan`
- `CreateResolutionInput` contains validated create selections plus `Registry`.
- `CreateResolutionPlan` contains a schema-valid `RepoConfig`, selected extension references, and diagnostics/unresolved entries.
- `planCreate()` remains public and delegates selection/config composition to the resolver.

- [ ] **Step 1: Write failing resolver tests** for unknown project type, missing preset, incompatible preset, preset+explicit stack merge, monorepo agent selection, and generated-config schema validity.
- [ ] **Step 2: Run `pnpm vitest run tests/core/resolver/create-resolver.test.ts`** and verify failures are caused by missing resolver behavior.
- [ ] **Step 3: Implement minimal pure resolver** using `Registry`, `RepositoryStandardError`, and `RepoConfigSchema.parse()`; perform no filesystem writes and run no commands.
- [ ] **Step 4: Route `planCreate()` through the resolver** while preserving its existing return shape and preview.
- [ ] **Step 5: Run resolver + create-service tests**, then `pnpm typecheck`.
- [ ] **Step 6: Commit** `refactor: extract create composition resolver`.

### Task 2: Introduce explicit execution plan and executor

**Files:**
- Create: `src/core/planning/execution-plan.ts`
- Create: `src/core/planning/create-planner.ts`
- Create: `src/execution/executor.ts`
- Modify: `src/application/create-service.ts`
- Test: `tests/core/planning/create-planner.test.ts`
- Test: `tests/execution/executor.test.ts`

**Interfaces:**
- Produces: `planCreateExecution(resolution: CreateResolutionPlan): ExecutionPlan`
- `ExecutionPlan.operations` uses discriminated operation types such as `generate`, `run-command`, `write-config`, `verify`, and `record-state`.
- `executePlan(plan, handlers)` dispatches operations and never re-resolves registry selections.

- [ ] **Step 1: Write failing planner tests** asserting deterministic ordering and generic operation metadata.
- [ ] **Step 2: Write failing executor dispatch tests** asserting each operation reaches exactly its matching handler.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Implement typed execution-plan contracts and pure planner.**
- [ ] **Step 5: Implement executor dispatch and adapt `applyCreatePlan()` to execute the plan through handlers without changing generated output.**
- [ ] **Step 6: Run focused tests, full `pnpm test`, and `pnpm typecheck`.**
- [ ] **Step 7: Commit** `refactor: add create execution planner`.

### Task 3: Move stack-specific generation out of create-service

**Files:**
- Create: `src/execution/generators/create-generator.ts`
- Create: `src/execution/generators/monorepo-generator.ts`
- Create: `src/execution/generators/vite-generator.ts`
- Create: `src/execution/templates/` focused template modules as needed
- Create/Modify: `registry/stacks/*/manifest.yaml`
- Modify: `registry/presets/recommended-monorepo/manifest.yaml`
- Modify: `src/application/create-service.ts`
- Test: `tests/execution/generators/monorepo-generator.test.ts`
- Test: `tests/core/config/repo-config.test.ts`

**Interfaces:**
- Produces: generator handlers selected by generic operation metadata.
- Preset stack values must each be a single valid extension reference.

- [ ] **Step 1: Write failing test proving `recommended-monorepo` resolves to schema-valid stack references.**
- [ ] **Step 2: Write failing generator parity test** for current monorepo output contract.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Split framework-specific generation helpers out of `create-service.ts` into generator modules.**
- [ ] **Step 5: Add minimal stack manifests needed for the current supported preset and repair composite `vite@8 + react@19` data.**
- [ ] **Step 6: Run focused tests, full `pnpm test`, `pnpm typecheck`, and `pnpm build`.**
- [ ] **Step 7: Commit** `refactor: extract stack generators`.

### Task 4: Extract authentication as capabilities

**Files:**
- Create: `registry/capabilities/auth-custom/manifest.yaml`
- Create: `registry/capabilities/auth-clerk/manifest.yaml`
- Create: `src/execution/capabilities/auth-custom.ts`
- Create: `src/execution/capabilities/auth-clerk.ts`
- Create: `src/core/resolver/capability-resolver.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/application/create-service.ts`
- Test: `tests/core/resolver/capability-resolver.test.ts`
- Test: `tests/application/create-service.test.ts`
- Test: `tests/cli/main.test.ts`

**Interfaces:**
- Legacy CLI `--auth custom|clerk` maps to capability IDs `auth-custom` / `auth-clerk`.
- Generic application/core logic receives capability selections and does not branch on Clerk implementation details.

- [ ] **Step 1: Write failing capability resolution tests** for existence, compatibility, and missing dependency behavior.
- [ ] **Step 2: Write failing CLI compatibility tests** proving `--auth clerk` maps to the Clerk capability while preserving UX.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Add auth capability manifests and resolver.**
- [ ] **Step 5: Move custom/Clerk file generation into capability executors and remove provider-specific bodies from `create-service.ts`.**
- [ ] **Step 6: Run auth/create/CLI tests and full verification.**
- [ ] **Step 7: Commit** `refactor: model authentication as capabilities`.

### Task 5: Resolve and render agents through an adapter

**Files:**
- Create: `src/core/resolver/agent-resolver.ts`
- Create: `src/execution/agents/agent-adapter.ts`
- Create: `src/execution/agents/codex-agent-adapter.ts`
- Modify: `registry/agents/*/manifest.yaml`
- Modify: `src/application/create-service.ts`
- Test: `tests/core/resolver/agent-resolver.test.ts`
- Test: `tests/execution/agents/codex-agent-adapter.test.ts`

**Interfaces:**
- `resolveAgents(...)` returns agent extension references based on mode/project composition.
- `CodexAgentAdapter` renders current `AGENTS.md` + TOML files from resolved agent definitions.

- [ ] **Step 1: Write failing tests** for automatic monorepo agent selection and reviewer review-only behavior.
- [ ] **Step 2: Write failing Codex adapter output test.**
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Extend agent manifests with only metadata required by current behavior.**
- [ ] **Step 5: Implement resolver + Codex adapter and remove hardcoded agent IDs/TOML bodies from `create-service.ts`.**
- [ ] **Step 6: Run focused and full verification.**
- [ ] **Step 7: Commit** `refactor: generate agents through adapter`.

### Task 6: Track managed files and align documentation

**Files:**
- Modify: `src/application/project-state.ts`
- Modify: execution handlers to report managed outputs
- Modify: `README.md`
- Create: `tests/application/project-state.test.ts`
- Create: `tests/architecture/create-boundaries.test.ts`

**Interfaces:**
- Execution results report `{ path, owner, version?, hash }` for managed files.
- Managed state records all files created/owned by the pipeline after successful verification.

- [ ] **Step 1: Write failing managed-state tests** for multiple files, ownership, and hashes.
- [ ] **Step 2: Write failing architecture regression test** that generic Core/Application files no longer contain implementation branching for extracted provider/framework concerns.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Extend managed-state writer and propagate managed-file results through execution.**
- [ ] **Step 5: Update README to describe the implemented CLI and extension-driven architecture.**
- [ ] **Step 6: Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.**
- [ ] **Step 7: Review diff for generated-source bodies remaining in `create-service.ts`; remove only code covered by this spec.**
- [ ] **Step 8: Commit** `docs: align extension-driven create architecture`.

## Final verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Create a temporary monorepo with custom auth and verify generated config parses.
- [ ] Create a temporary monorepo with Clerk auth and verify generated config parses.
- [ ] Compare branch against `main` and confirm no unrelated changes.
