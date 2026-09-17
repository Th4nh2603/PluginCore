# Extension-Driven Create Pipeline Refactor

## Status

Design approved in conversation on 2026-09-17. This document turns that agreed direction into an implementation contract for refactoring `repo create` without changing its user-facing purpose.

## Goal

Refactor PluginCore so `repo create` is driven by registry extensions and explicit resolution/execution plans instead of hardcoded framework, authentication, and agent generation logic in `src/application/create-service.ts`.

The refactor must preserve the existing CLI entry point and current monorepo behavior while moving technology-specific knowledge behind extension, generator, capability, and adapter boundaries.

## Current problem

The repository already has the intended top-level separation:

```text
CLI -> Application -> Core -> Registry
```

However, `src/application/create-service.ts` currently owns several responsibilities at once:

- validates create input;
- resolves project type and preset compatibility;
- composes `repo.config.yaml`;
- knows that monorepo means Vite + React + Express + shared TypeScript;
- knows Prisma, PostgreSQL, Argon2, JWT, Clerk, pnpm, Docker Compose, and Vitest;
- writes framework-specific source files directly;
- writes host-specific agent TOML files directly;
- runs generators and dependency installation;
- records only a minimal managed-state file.

This contradicts the Phase 1 architecture decision that Core and application services should not know framework-, provider-, database-, or AI-host-specific implementation details.

## Architectural principles

1. **Application services orchestrate; they do not resolve or generate technology-specific content.**
2. **Core operates on generic extension contracts only.** It understands kinds such as `project-type`, `stack-component`, `preset`, `capability`, `agent`, `flow`, `integration`, and `adapter`.
3. **Registry content describes selections and compatibility.** Recommended stacks remain data, not application branches.
4. **Resolver answers “what is selected?”** It performs no filesystem writes and runs no commands.
5. **Planner answers “what operations are required?”** It converts a resolution into an immutable execution plan.
6. **Executors answer “how is this operation performed?”** Generators, capability installers, command runners, and host adapters implement operations.
7. **Generated configuration is schema-validated before writes.** The plugin must never create a `repo.config.yaml` that `repo doctor` immediately rejects.
8. **Managed state records all plugin-managed outputs.** Updates must eventually be able to distinguish unchanged managed files, user-modified managed files, and project-owned files.
9. **Preserve behavior during refactor.** Existing `repo create`, monorepo scaffolding, custom auth, Clerk auth, tests, and CLI UX remain functional unless a later explicitly-scoped change replaces them.

## Target flow

```text
User / automation
      |
      v
CLI
  parse flags + prompts only
      |
      v
CreateRepositoryService
  orchestration only
      |
      v
CompositionResolver
  project type
  preset
  stack
  capabilities
  agents
      |
      v
ResolutionPlan
      |
      v
RepositoryPlanner
      |
      v
ExecutionPlan
      |
      +-------------------------------+
      |               |               |
      v               v               v
TemplateGenerator  CapabilityExecutor AgentAdapter
      |               |               |
      +-------+-------+---------------+
              |
              v
         CommandRunner
              |
              v
           Verifier
              |
              v
        ManagedStateWriter
              |
              v
      Generated repository
```

## Component boundaries

### CLI

`src/cli/main.ts` remains responsible for:

- parsing user flags;
- interactive prompts;
- listing registry choices for display;
- printing preview and diagnostics;
- confirmation and exit codes.

It must not contain framework/provider-specific generation branches.

### CreateRepositoryService

Introduce a focused application service that receives a normalized `CreateRepositoryRequest` and coordinates:

```ts
resolveComposition(request, registry)
planRepository(resolutionPlan)
executePlan(executionPlan)
verifyRepository(executionPlan)
recordManagedState(executionPlan)
```

The service must not inspect technology IDs such as `vite`, `react`, `express`, `prisma`, or `clerk` to select implementation behavior.

### CompositionResolver

The resolver accepts validated create input and a `Registry`.

It must:

- resolve the requested `project-type`;
- resolve and validate an optional `preset`;
- merge preset stack selections with explicit stack overrides;
- resolve capability dependencies;
- validate compatibility;
- select agents according to agent mode and extension hints;
- return unresolved required/optional selections as diagnostics;
- return an immutable `ResolutionPlan`.

The resolver performs no writes and runs no commands.

### RepositoryPlanner

The planner converts `ResolutionPlan` into ordered operations.

Operation categories are generic:

```ts
type ExecutionOperation =
  | GenerateOperation
  | InstallCapabilityOperation
  | GenerateAgentOperation
  | RunCommandOperation
  | VerifyOperation
  | WriteConfigOperation
  | RecordManagedStateOperation;
```

Ordering must respect declared dependencies. A capability that requires a React adapter cannot execute before the React stack component is generated.

### Execution layer

Add focused execution interfaces rather than growing `create-service.ts`.

Suggested ownership:

```text
src/execution/
├── executor.ts
├── command-runner.ts
├── generators/
│   ├── generator.ts
│   └── template-generator.ts
├── capabilities/
│   └── capability-executor.ts
└── agents/
    └── agent-adapter.ts
```

The executor dispatches operations by type. It must not re-resolve selections.

## Registry changes

### Project types

Project type manifests describe structure and valid selection categories, not hardcoded implementation logic.

Example:

```yaml
schemaVersion: 1
id: monorepo
kind: project-type
version: 1.0.0
displayName: Monorepo
compatibility: {}
```

A future schema extension may add categories and a recommended preset, but the first refactor should avoid unnecessary schema expansion unless required by implementation.

### Presets

`recommended-monorepo` must use one valid extension reference per stack key.

Replace composite values such as:

```yaml
web: vite@8 + react@19
```

with independently resolvable selections, for example:

```yaml
selection:
  stack:
    workspace: pnpm-workspaces@10
    frontend-framework: vite@8
    frontend-library: react@19
    backend-framework: express@5
    shared-language: typescript@5
    testing: vitest@4
```

Every value written into `RepoConfig.composition.stack` must satisfy `RepoConfigSchema`.

### Stack components

Technology-specific stack knowledge moves toward `registry/stacks/` entries.

The initial refactor may introduce only the entries needed by currently supported create flows. It must not attempt to build a universal stack catalog.

Expected initial entries include the currently hardcoded monorepo components where practical:

- `pnpm-workspaces`;
- `vite`;
- `react`;
- `express`;
- `typescript`;
- `vitest`;
- optionally database/ORM components when their current behavior is extracted.

### Authentication capabilities

Authentication becomes a capability boundary instead of a Core/Application special case.

Target extension shape:

```text
registry/capabilities/
├── auth-custom/
└── auth-clerk/
```

`auth-clerk` contains or references the operations/templates needed for the web and API integration. `auth-custom` represents the existing Prisma/JWT/Argon2 flow.

During migration, CLI compatibility may keep accepting `--auth custom|clerk`; the CLI converts that legacy UX into capability selections. The application/core layers must not retain `if auth === "clerk"` implementation branches after the capability migration is complete.

### Agents

Keep the existing `frontend`, `backend`, `shared`, and `reviewer` registry entries, but make them drive selection rather than duplicating their IDs and TOML bodies inside `create-service.ts`.

The target pipeline is:

```text
agent manifest -> agent resolver -> host adapter -> generated host files
```

For current behavior, the Codex adapter may generate:

```text
AGENTS.md
agents/frontend.toml
agents/backend.toml
agents/shared.toml
agents/reviewer.toml
```

Adding another host later should require another adapter, not duplicate agent definitions in Core.

## Configuration contract

`repo.config.yaml` remains the canonical project configuration.

Before writing it:

```ts
const config = RepoConfigSchema.parse(candidateConfig);
```

The create pipeline must use the parsed result for the write and for managed-state hashing.

`composition.authentication` is transitional. The preferred end state is capability-based authentication. It may remain temporarily for backward compatibility during staged migration, but no new provider-specific fields should be added to Core config.

## Managed state

The current state tracks only `repo.config.yaml`. The target managed-state model records every plugin-managed file with ownership metadata.

Example:

```yaml
schemaVersion: 1
pluginVersion: 0.2.0
extensions:
  - id: auth-clerk
    version: 1.0.0
files:
  - path: repo.config.yaml
    owner: core
    hash: "..."
  - path: apps/web/src/main.tsx
    owner: capability:auth-clerk
    version: 1.0.0
    hash: "..."
  - path: agents/frontend.toml
    owner: agent:frontend
    version: 1.0.0
    hash: "..."
```

This refactor must establish the data model and record files created through the new execution pipeline. Full `repo update` conflict handling is outside this scope.

## Migration strategy

The refactor is staged to keep the repository usable after every phase.

### Stage 1 — Pure resolution boundary

- extract create resolution from `create-service.ts` into `src/core/resolver/`;
- add tests for project type, preset compatibility, stack merge, invalid selections, and config schema validity;
- keep existing generator implementation temporarily;
- route `planCreate()` through the resolver.

### Stage 2 — Planner and execution contracts

- introduce `ExecutionPlan` and generic operation types;
- convert existing generation actions into planner output;
- introduce executor/command-runner interfaces;
- keep behavior equivalent.

### Stage 3 — Stack/template extraction

- move framework-specific file bodies out of `create-service.ts`;
- add the minimal stack registry/template content needed for current flows;
- keep Vite CLI invocation behind a generator adapter.

### Stage 4 — Authentication capability extraction

- introduce `auth-custom` and `auth-clerk` capabilities;
- map the existing `--auth` UX to these capabilities;
- remove provider-specific generation logic from application/core layers.

### Stage 5 — Agent adapter extraction

- remove hardcoded monorepo agent IDs and TOML bodies from `create-service.ts`;
- resolve agents from registry metadata;
- generate Codex files through a host adapter.

### Stage 6 — Managed state and documentation

- record all files managed by execution operations;
- update README to describe the real CLI and architecture;
- add architecture tests that prevent framework/provider imports or IDs from creeping back into generic Core/Application modules.

## Error handling

All resolution and planning failures use `RepositoryStandardError` with stable codes and diagnostic data.

Required failures include:

- missing project type;
- missing preset/capability/agent extension;
- incompatible preset or capability;
- unresolved required dependency;
- invalid generated `RepoConfig`;
- target path conflicts;
- execution operation failure;
- verification failure.

Partial execution must not silently report success. Managed state is written only after successful generation and required verification.

A full transactional rollback engine is not part of this refactor, but operation results must retain enough metadata for a future journal/rollback implementation.

## Testing strategy

Use TDD for each extraction step.

### Unit tests

Cover:

- resolver selection and compatibility;
- dependency ordering;
- planner operation output;
- execution dispatch;
- config validation;
- agent selection;
- capability resolution;
- managed-file hashing/ownership.

### Application tests

Existing `tests/application/create-service.test.ts` behavior remains green while responsibilities are moved into smaller units.

Add tests asserting that create requests produce equivalent repository outputs for:

- monorepo + custom auth;
- monorepo + Clerk auth;
- recommended web preset;
- invalid preset/project-type combinations.

### CLI tests

Preserve interactive/non-interactive semantics, including preview and `--yes` behavior.

### Architectural regression tests

Add a small guard that generic Core/Application modules do not contain provider/framework-specific branching for `clerk`, `vite`, `react`, `express`, `prisma`, or `argon2` once their extraction stage is complete.

## Non-goals

This refactor does not implement:

- every stack combination;
- a marketplace or remote registry;
- `repo update` conflict resolution;
- deployment adapters;
- all AI coding hosts;
- arbitrary executable code inside untrusted manifests;
- a rewrite of the CLI UX unrelated to extension boundaries.

## Acceptance criteria

The refactor is complete when:

1. `repo create` still supports the current create flows.
2. `create-service.ts` is reduced to orchestration/backward-compatible facade responsibilities rather than containing generated application source.
3. Resolution is implemented under `src/core/resolver/` and is independently tested.
4. Planner/executor contracts exist and generation runs from an `ExecutionPlan`.
5. The monorepo preset produces a schema-valid `repo.config.yaml`.
6. Clerk/custom auth are represented as capabilities or capability-backed compatibility mappings rather than implementation branches in generic Core/Application code.
7. Agent IDs/content are resolved/generated through registry + adapter boundaries.
8. Managed state records all files owned by the plugin execution pipeline.
9. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
10. README reflects the implemented architecture and CLI status.
