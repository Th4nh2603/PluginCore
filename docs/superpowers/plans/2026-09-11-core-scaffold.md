# Core Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a tested TypeScript core that can safely parse a managed repository configuration, discover declarative extensions, validate their compatibility, and expose resolver contracts for later CLI work.

**Architecture:** The Phase 2 scaffold separates immutable domain contracts, filesystem boundary checks, configuration parsing, registry loading, and resolver interfaces. It contains no CLI prompts, generator, capability installer, host-agent adapter, or sample technology-specific logic; registry fixtures prove the extension boundary instead.

**Tech Stack:** Node.js 20+, TypeScript 5 in strict ESM mode, pnpm, Vitest, Zod, YAML.

**Spec:** `docs/superpowers/specs/2026-09-10-repository-standard-plugin-design.md`

## Global Constraints

- Keep Core domain-, stack-, capability-, and AI-agent-agnostic.
- Treat manifests as declarative data; manifests may not execute arbitrary shell commands.
- Validate configuration and manifests before resolution.
- Resolve every filesystem target within its approved root and use path APIs rather than string concatenation.
- Do not log secrets or persist them in `repo.config.yaml`.
- Do not implement a CLI, interactive UX, generator, capability lifecycle execution, host adapter, update engine, or sample project in this phase.
- Use SemVer strings and schema version `1` in all initial contracts.

---

## Planned file structure

```text
package.json                         # scripts and narrowly scoped dependencies
pnpm-workspace.yaml                  # one-package workspace foundation
tsconfig.json                        # strict ESM TypeScript compiler settings
vitest.config.ts                     # test discovery and coverage configuration
.gitignore                           # Node, coverage, build, local state exclusions
.editorconfig                        # newline and indentation baseline
README.md                            # Phase 2 purpose and command reference
src/core/contracts.ts                # extension, compatibility, diagnostics contracts
src/core/errors.ts                   # typed domain errors
src/core/result.ts                   # Result<T> discriminated union
src/core/security/project-path.ts    # project-root boundary validation
src/core/config/repo-config.ts       # repo.config.yaml Zod schema and parser
src/core/registry/manifest.ts        # extension manifest Zod schema
src/core/registry/registry-loader.ts # discover/load/validate/index manifests
src/core/resolver/contracts.ts       # generic resolver plan/input/output interfaces
src/core/validation/validation.ts    # shared diagnostic collection helpers
tests/core/result.test.ts
tests/smoke.test.ts                  # proves test runner is wired before domain tests
tests/core/security/project-path.test.ts
tests/core/config/repo-config.test.ts
tests/core/registry/registry-loader.test.ts
tests/core/resolver/contracts.test.ts
tests/fixtures/registry/...          # valid and invalid declarative manifest fixtures
```

### Task 1: Establish the strict TypeScript test foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `README.md`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` commands used by all later tasks.

- [x] **Step 1: Write the baseline package metadata and scripts**

```json
{
  "name": "repo-standard-plugin",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  }
}
```

Add `typescript`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `zod`, and `yaml` with current compatible versions. Configure ESLint for the `src/` and `tests/` TypeScript files; `lint` must fail on unused variables and unsafe `any`.

- [x] **Step 2: Write compiler and test configuration**

Set `target` and `lib` to `ES2023`, `module` and `moduleResolution` to `NodeNext`, and enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `verbatimModuleSyntax`. Include `src/**/*.ts`, `tests/**/*.ts`, and `vitest.config.ts`; direct compiler output to `dist/`. Configure Vitest to discover `tests/**/*.test.ts` in the Node environment and collect coverage from `src/**/*.ts`.

Create `tests/smoke.test.ts`:

```ts
import { expect, it } from "vitest";

it("runs the test suite", () => {
  expect(true).toBe(true);
});
```

- [x] **Step 3: Install dependencies and run the empty verification commands**

Run: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: every command exits `0`; Vitest reports no test files only until Task 2 adds the first test.

- [x] **Step 4: Commit the tooling foundation**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts .gitignore .editorconfig README.md eslint.config.js tests/smoke.test.ts
git commit -m "chore: initialize TypeScript core tooling"
```

### Task 2: Add minimal domain result and error contracts

**Files:**
- Create: `src/core/result.ts`
- Create: `src/core/errors.ts`
- Create: `tests/core/result.test.ts`

**Interfaces:**
- Produces: `Result<T, E>`, `ok(value)`, `err(error)`, `isOk(result)`, `isErr(result)`, and `RepositoryStandardError`.
- Consumes: Task 1 TypeScript/Vitest tooling.

- [x] **Step 1: Write failing result-contract tests**

```ts
import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "../../src/core/result.js";

describe("Result", () => {
  it("narrows a success result", () => {
    const result = ok({ id: "web" });
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) expect(result.value.id).toBe("web");
  });

  it("narrows a failure result", () => {
    const result = err(new Error("invalid"));
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/core/result.test.ts`

Expected: FAIL because `src/core/result.ts` does not exist.

- [x] **Step 3: Implement the smallest typed result and error surface**

```ts
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;
```

Define `RepositoryStandardError` with stable `code`, human-readable `message`, optional `cause`, and optional read-only diagnostic data. Use error codes `CONFIG_INVALID`, `MANIFEST_INVALID`, `PATH_OUTSIDE_ROOT`, and `REGISTRY_CONFLICT`.

- [x] **Step 4: Run test, lint, and typecheck**

Run: `pnpm vitest run tests/core/result.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`.

- [x] **Step 5: Commit the domain contracts**

```bash
git add src/core/result.ts src/core/errors.ts tests/core/result.test.ts
git commit -m "feat: add core result and error contracts"
```

### Task 3: Enforce project-root path boundaries

**Files:**
- Create: `src/core/security/project-path.ts`
- Create: `tests/core/security/project-path.test.ts`

**Interfaces:**
- Consumes: `RepositoryStandardError` from `src/core/errors.ts`.
- Produces: `resolveProjectPath(projectRoot: string, requestedPath: string): string`.

- [x] **Step 1: Write failing boundary tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveProjectPath } from "../../src/core/security/project-path.js";

describe("resolveProjectPath", () => {
  it("allows a child path", () => {
    expect(resolveProjectPath("/workspace/demo", ".repo-standard/state.yaml"))
      .toBe("/workspace/demo/.repo-standard/state.yaml");
  });

  it("rejects traversal outside the root", () => {
    expect(() => resolveProjectPath("/workspace/demo", "../secrets.txt"))
      .toThrow(/outside the project root/i);
  });
});
```

Use `path.join(process.cwd(), "tests", "tmp", "demo")` in the actual test rather than asserting POSIX separators, so it is portable on Windows.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/core/security/project-path.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement root containment using resolved paths**

Resolve the root and requested path with `node:path.resolve`. Accept only the exact root or a path beginning with `root + path.sep`; otherwise throw `RepositoryStandardError` with code `PATH_OUTSIDE_ROOT`. Do not use prefix comparison without a separator.

- [x] **Step 4: Run the focused test and project checks**

Run: `pnpm vitest run tests/core/security/project-path.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`.

- [x] **Step 5: Commit the boundary guard**

```bash
git add src/core/security/project-path.ts tests/core/security/project-path.test.ts
git commit -m "feat: guard project file boundaries"
```

### Task 4: Parse and validate the canonical project configuration

**Files:**
- Create: `src/core/config/repo-config.ts`
- Create: `tests/core/config/repo-config.test.ts`

**Interfaces:**
- Consumes: `RepositoryStandardError` and `resolveProjectPath`.
- Produces: `RepoConfigSchema`, `RepoConfig`, `parseRepoConfig(text: string): RepoConfig`, and `loadRepoConfig(projectRoot: string): Promise<RepoConfig>`.

- [x] **Step 1: Write failing parser tests**

```ts
it("parses a version-one project config", () => {
  const config = parseRepoConfig(`
schemaVersion: 1
plugin: { id: repo-standard, version: 0.1.0 }
project: { name: demo, type: web-application, root: . }
composition: { stack: { runtime: nodejs@22 } }
agents: { mode: automatic, enabled: [], adapters: [] }
flows: { defaults: [feature] }
standards: { overrides: [] }
managed: { stateFile: .repo-standard/managed-state.yaml }
`);
  expect(config.project.name).toBe("demo");
});

it("rejects plaintext secret-like configuration keys", () => {
  expect(() => parseRepoConfig("schemaVersion: 1\napiKey: exposed"))
    .toThrow(/secret/i);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/core/config/repo-config.test.ts`

Expected: FAIL because the parser module does not exist.

- [x] **Step 3: Implement the schema and safe loader**

Use `yaml.parse` then Zod to validate the documented schema's required `schemaVersion`, `plugin`, `project`, `composition.stack`, `agents`, `flows`, `standards`, and `managed` fields. Permit optional `composition.preset`, `composition.capabilities`, and `integrations`. Require extension references to use `id@version` format. Recursively reject keys matching `/password|secret|token|api[-_]?key/i` unless the value is an object containing exactly `env` or `secretRef`. Convert YAML/Zod errors to `RepositoryStandardError` code `CONFIG_INVALID`; read only `repo.config.yaml` resolved through `resolveProjectPath`.

- [x] **Step 4: Run parser checks**

Run: `pnpm vitest run tests/core/config/repo-config.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`.

- [x] **Step 5: Commit configuration support**

```bash
git add src/core/config/repo-config.ts tests/core/config/repo-config.test.ts
git commit -m "feat: validate repository configuration"
```

### Task 5: Validate and index declarative registry manifests

**Files:**
- Create: `src/core/contracts.ts`
- Create: `src/core/registry/manifest.ts`
- Create: `src/core/registry/registry-loader.ts`
- Create: `tests/core/registry/registry-loader.test.ts`
- Create: `tests/fixtures/registry/project-types/web/manifest.yaml`
- Create: `tests/fixtures/registry/agents/security/manifest.yaml`
- Create: `tests/fixtures/registry/invalid/missing-kind.yaml`
- Create: `tests/fixtures/registry/conflict/project-types/web/manifest.yaml`

**Interfaces:**
- Consumes: `Result`, `RepositoryStandardError`, and `resolveProjectPath`.
- Produces: `ExtensionKind`, `ExtensionManifest`, `Registry`, `loadRegistry(registryRoot: string): Promise<Registry>`, and `registry.get(kind, id)`.

- [x] **Step 1: Write failing registry tests**

```ts
it("loads manifests into an ID and kind index", async () => {
  const registry = await loadRegistry(fixtureRoot("registry"));
  expect(registry.get("project-type", "web-application")?.version).toBe("1.0.0");
  expect(registry.get("agent", "security")?.kind).toBe("agent");
});

it("rejects duplicate kind and ID entries", async () => {
  await expect(loadRegistry(fixtureRoot("conflict")))
    .rejects.toMatchObject({ code: "REGISTRY_CONFLICT" });
});

it("rejects a manifest missing its kind", async () => {
  await expect(loadRegistry(fixtureRoot("invalid")))
    .rejects.toMatchObject({ code: "MANIFEST_INVALID" });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/core/registry/registry-loader.test.ts`

Expected: FAIL because the registry modules and fixtures are absent.

- [x] **Step 3: Implement the manifest schema and loader**

Define a discriminated Zod schema with common fields `id`, `kind`, `version`, `schemaVersion`, `displayName`, optional `description`, `compatibility`, `dependencies`, `policyRefs`, and `agentHints`. Support only the declared extension kinds from the architecture. Recursively locate files named `manifest.yaml`, parse and validate each, and index by `kind:id`. Reject duplicate keys, unsupported schema versions, invalid SemVer-like versions, malformed extension IDs, and traversal outside `registryRoot`. Return an immutable `Registry` whose `get` method cannot expose a mutable backing map.

- [x] **Step 4: Run registry checks**

Run: `pnpm vitest run tests/core/registry/registry-loader.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`.

- [x] **Step 5: Commit the registry foundation**

```bash
git add src/core/contracts.ts src/core/registry tests/core/registry tests/fixtures/registry
git commit -m "feat: load validated extension registries"
```

### Task 6: Publish generic resolver and diagnostic contracts

**Files:**
- Create: `src/core/resolver/contracts.ts`
- Create: `src/core/validation/validation.ts`
- Create: `tests/core/resolver/contracts.test.ts`

**Interfaces:**
- Consumes: `RepoConfig`, `Registry`, and `ExtensionManifest`.
- Produces: `Diagnostic`, `DiagnosticSeverity`, `ResolutionInput`, `ResolutionPlan`, `Resolver<TInput, TPlan>`, and `validatePlan(plan: ResolutionPlan): readonly Diagnostic[]`.

- [x] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { validatePlan, type ResolutionPlan } from "../../src/core/resolver/contracts.js";

describe("resolution plan validation", () => {
  it("reports an error when a plan contains an unresolved required extension", () => {
    const plan: ResolutionPlan = {
      selected: [],
      unresolved: [{ id: "auth/example", reason: "not compatible", required: true }],
      diagnostics: []
    };
    expect(validatePlan(plan)).toContainEqual(expect.objectContaining({ severity: "error" }));
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/core/resolver/contracts.test.ts`

Expected: FAIL because resolver contracts do not exist.

- [x] **Step 3: Implement pure resolution interfaces**

Make `Resolver<TInput, TPlan>` expose `resolve(input): Promise<TPlan>`. Define plans as data only: selected extension references, ordered operations with a declarative operation type, unresolved selections, explanations, and diagnostics. `validatePlan` must emit an error diagnostic for each unresolved required item and no filesystem writes. Keep agent, preset, flow, and capability resolver behavior for later phases; this task establishes only their shared contract.

- [x] **Step 4: Run focused and full verification**

Run: `pnpm vitest run tests/core/resolver/contracts.test.ts && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: every command exits `0` and Vitest reports all tests passing.

- [x] **Step 5: Commit the resolver contracts**

```bash
git add src/core/resolver/contracts.ts src/core/validation/validation.ts tests/core/resolver/contracts.test.ts
git commit -m "feat: define generic resolution contracts"
```

### Task 7: Document the Phase 2 public surface and validate clean checkout behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-11-core-scaffold.md`

**Interfaces:**
- Consumes: all Task 1–6 public contracts.
- Produces: documented commands and an explicit Phase 2 completion note; no new runtime behavior.

- [x] **Step 1: Document exact supported Phase 2 behavior**

Add a README section listing the four working engineering commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`), the supported core modules, and explicit exclusions: no `repo` CLI command, no create flow, no external adapters, and no lifecycle execution yet. Link to the architecture and this implementation plan.

- [x] **Step 2: Run clean dependency and full verification**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: exit `0`; no source file is emitted outside `dist/`; all registry/config/path/resolver tests pass.

- [x] **Step 3: Inspect the change scope**

Run: `git status --short && git diff --check && git diff --stat HEAD`

Expected: no whitespace errors; only Phase 2 tooling, core, tests, fixtures, README, lockfile, and plan/spec status changes appear.

- [x] **Step 4: Commit the Phase 2 scaffold**

```bash
git add README.md docs/superpowers src tests package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts eslint.config.js .gitignore .editorconfig
git commit -m "docs: complete core scaffold phase"
```

## Plan self-review

### Specification coverage

Phase 2 requirements map to Tasks 1–6: TypeScript/tooling (Task 1); config parser (Task 4); registry interfaces/loading (Task 5); resolver interfaces (Task 6); validation foundation (Tasks 4–6); and safety boundaries (Tasks 3–5). Agent, flow, capability execution, CLI commands, generators, updater, and integrations remain explicitly deferred to their roadmap phases.

### Completeness scan

The plan has no unfinished markers or vague follow-up steps. Items intentionally outside Phase 2 are explicitly named non-goals constrained by the approved architecture.

### Type consistency

`RepositoryStandardError` originates in Task 2 and is consumed by Tasks 3–5. `RepoConfig` from Task 4 and `Registry` from Task 5 are consumed by Task 6. The resolver plan remains pure data and has no dependency on later CLI or execution modules.
