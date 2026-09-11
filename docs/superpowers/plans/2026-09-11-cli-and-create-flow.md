# CLI and Create Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable `repo` executable with help, info, doctor, and a safe, reviewable repository-create flow.

**Architecture:** A thin CLI parses arguments and delegates to application services. Create resolves only declarative registry content, builds a no-write plan first, then writes the canonical project config and managed-state file only after explicit confirmation; no capability lifecycle or technology-specific core branch is introduced.

**Tech Stack:** Node.js 20+, TypeScript strict ESM, pnpm, Vitest, Zod, YAML, `@inquirer/prompts`.

**Spec:** `docs/superpowers/specs/2026-09-10-repository-standard-plugin-design.md`

## Global Constraints

- Keep Core domain-, stack-, capability-, and AI-agent-agnostic; sample choices stay in `registry/`.
- `repo create` must plan before mutation and reject a non-empty target directory.
- Resolve every project target through `resolveProjectPath`; never log or write secrets.
- Support non-interactive flags and interactive selection for required create choices.
- Doctor is read-only and returns structured diagnostics.
- This phase does not execute capabilities, generate framework source, install packages, or implement updates.

---

## Planned file structure

```text
src/cli/main.ts                         # executable entrypoint and exit code mapping
src/cli/arguments.ts                    # strict generic argv parser
src/cli/presentation.ts                 # text formatting; no domain decisions
src/application/info-service.ts          # installation/version data
src/application/doctor-service.ts        # read-only config and registry checks
src/application/create-service.ts        # plan/apply create use case
src/application/project-state.ts         # managed-state schema and atomic writes
src/core/registry/project-type-resolver.ts # type/preset lookup from Registry
registry/project-types/empty/manifest.yaml
registry/presets/recommended-empty/manifest.yaml
bin/repo.cjs                             # executable bootstrap after build
tests/cli/main.test.ts
tests/application/doctor-service.test.ts
tests/application/create-service.test.ts
tests/fixtures/create-registry/**
```

### Task 1: Make the CLI executable and provide `--help` and `info`

**Files:**
- Modify: `package.json`
- Create: `bin/repo.cjs`
- Create: `src/application/info-service.ts`
- Create: `src/cli/arguments.ts`
- Create: `src/cli/main.ts`
- Create: `tests/cli/main.test.ts`

**Interfaces:**
- Produces: `parseArguments(argv: readonly string[]): ParsedCommand`, `buildInfo(): PluginInfo`, and `runCli(argv, io): Promise<number>`.

- [ ] **Step 1: Write failing CLI behavior tests**

```ts
it("prints command help without reading the filesystem", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["--help"], { write: (line) => output.push(line) });
  expect(exitCode).toBe(0);
  expect(output.join("\n")).toContain("repo create <name>");
});

it("prints the plugin identifier and version", async () => {
  const output: string[] = [];
  await runCli(["info"], { write: (line) => output.push(line) });
  expect(output.join("\n")).toContain("repo-standard");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run tests/cli/main.test.ts`

Expected: FAIL because `runCli` does not exist.

- [ ] **Step 3: Implement a minimal executable surface**

Add the package `bin` entry `{"repo":"bin/repo.cjs"}`. The CommonJS bootstrap imports `../dist/src/cli/main.js` and passes `process.argv.slice(2)`. `runCli` recognizes only `--help`, `help`, and `info` at this task, prints static usage from a presentation module, and returns `0`; unknown commands return `2` with usage. `buildInfo` reads only package metadata compiled into a typed constant.

- [ ] **Step 4: Verify the executable**

Run: `pnpm vitest run tests/cli/main.test.ts && pnpm lint && pnpm typecheck && pnpm build && node bin/repo.cjs --help`

Expected: exit `0`; help contains `repo create <name>`, `repo info`, and `repo doctor`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml bin src/cli src/application/info-service.ts tests/cli/main.test.ts
git commit -m "feat: add repository CLI foundation"
```

### Task 2: Add a read-only `repo doctor`

**Files:**
- Create: `src/application/doctor-service.ts`
- Modify: `src/cli/main.ts`
- Modify: `tests/cli/main.test.ts`
- Create: `tests/application/doctor-service.test.ts`

**Interfaces:**
- Consumes: `loadRepoConfig`, `loadRegistry`, `Diagnostic`.
- Produces: `runDoctor(input: DoctorInput): Promise<DoctorReport>` where `DoctorReport` has `passed`, `warnings`, and `errors` diagnostic arrays.

- [ ] **Step 1: Write failing doctor tests**

```ts
it("reports a missing repo.config.yaml as a warning", async () => {
  const report = await runDoctor({ projectRoot: emptyTemporaryDirectory });
  expect(report.warnings).toContainEqual(expect.objectContaining({ code: "CONFIG_MISSING" }));
  expect(report.errors).toEqual([]);
});

it("reports a valid config as passed", async () => {
  const report = await runDoctor({ projectRoot: configuredTemporaryDirectory });
  expect(report.passed).toContainEqual(expect.objectContaining({ code: "CONFIG_VALID" }));
});
```

- [ ] **Step 2: Run focused tests to verify red**

Run: `pnpm vitest run tests/application/doctor-service.test.ts`

Expected: FAIL because `runDoctor` does not exist.

- [ ] **Step 3: Implement doctor as a read-only service**

`runDoctor` calls `loadRepoConfig(projectRoot)` and maps `ENOENT` to warning `CONFIG_MISSING`; config validation errors become `CONFIG_INVALID` errors; a valid config emits `CONFIG_VALID`. When `registryRoot` is supplied, it calls `loadRegistry` and reports `REGISTRY_VALID` or an error diagnostic. `repo doctor [--project-root <path>] [--registry <path>]` prints summary counts and returns `1` only when errors exist.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/application/doctor-service.test.ts tests/cli/main.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/application/doctor-service.ts src/cli/main.ts tests/application/doctor-service.test.ts tests/cli/main.test.ts
git commit -m "feat: add read-only repository doctor"
```

### Task 3: Add extension-provided project types and safe create planning

**Files:**
- Create: `registry/project-types/empty/manifest.yaml`
- Create: `registry/presets/recommended-empty/manifest.yaml`
- Create: `src/core/registry/project-type-resolver.ts`
- Create: `src/application/create-service.ts`
- Create: `tests/application/create-service.test.ts`
- Create: `tests/fixtures/create-registry/**/manifest.yaml`

**Interfaces:**
- Produces: `planCreate(input: CreateInput): Promise<CreatePlan>`.
- `CreateInput` has `name`, `targetDirectory`, `projectType`, optional `preset`, stack map, agent mode, registry root, and selected capabilities.
- `CreatePlan` has `config`, `targetDirectory`, `operations`, and a `preview` string; it makes no writes.

- [ ] **Step 1: Write failing plan tests**

```ts
it("resolves a project type from the registry and returns a no-write plan", async () => {
  const plan = await planCreate({ name: "demo", projectType: "empty", targetDirectory, registryRoot, stack: {}, agentMode: "automatic", capabilities: [] });
  expect(plan.config.project.type).toBe("empty");
  expect(existsSync(targetDirectory)).toBe(false);
});

it("rejects a project type absent from the registry", async () => {
  await expect(planCreate({ ...validInput, projectType: "missing" })).rejects.toMatchObject({ code: "CONFIG_INVALID" });
});
```

- [ ] **Step 2: Run the create-plan test to verify red**

Run: `pnpm vitest run tests/application/create-service.test.ts`

Expected: FAIL because `planCreate` does not exist.

- [ ] **Step 3: Implement resolver and plan creation**

Resolve `project-type` and optional `preset` via `Registry.get`; verify the preset manifest declares compatible project type in `compatibility.projectTypes`. Validate name with `/^[a-z0-9][a-z0-9-]*$/i`; reject an existing target. Construct a `RepoConfig` from selected extension references and return operations `write-config` and `write-managed-state`. The core does not select a stack itself; empty/project preset data lives in `registry/`.

- [ ] **Step 4: Verify plan behavior**

Run: `pnpm vitest run tests/application/create-service.test.ts && pnpm lint && pnpm typecheck`

Expected: exit `0`; plan creation leaves no target directory.

- [ ] **Step 5: Commit**

```bash
git add registry src/core/registry/project-type-resolver.ts src/application/create-service.ts tests/application/create-service.test.ts tests/fixtures/create-registry
git commit -m "feat: plan extension-driven repository creation"
```

### Task 4: Apply a confirmed create plan and expose `repo create`

**Files:**
- Create: `src/application/project-state.ts`
- Modify: `src/application/create-service.ts`
- Modify: `src/cli/main.ts`
- Modify: `tests/application/create-service.test.ts`
- Modify: `tests/cli/main.test.ts`

**Interfaces:**
- Produces: `applyCreatePlan(plan: CreatePlan): Promise<void>` and CLI `repo create <name> --type <id> --target <path> [--preset <id>] [--stack category=id@version] [--agents mode] [--yes]`.

- [ ] **Step 1: Write failing apply and non-interactive CLI tests**

```ts
it("writes only config and managed state after applying a plan", async () => {
  const plan = await planCreate(validInput);
  await applyCreatePlan(plan);
  expect(existsSync(join(targetDirectory, "repo.config.yaml"))).toBe(true);
  expect(existsSync(join(targetDirectory, ".repo-standard", "managed-state.yaml"))).toBe(true);
});

it("requires --yes before a non-interactive create writes files", async () => {
  const exitCode = await runCli(["create", "demo", "--type", "empty", "--target", targetDirectory, "--registry", registryRoot], io);
  expect(exitCode).toBe(2);
  expect(existsSync(targetDirectory)).toBe(false);
});
```

- [ ] **Step 2: Run focused tests to verify red**

Run: `pnpm vitest run tests/application/create-service.test.ts tests/cli/main.test.ts`

Expected: FAIL because `applyCreatePlan` and `create` are absent.

- [ ] **Step 3: Implement atomic state writes and command review gate**

`applyCreatePlan` creates the target only after rechecking emptiness, writes YAML to same-directory temporary files, then renames them into `repo.config.yaml` and `.repo-standard/managed-state.yaml`. Managed state records schema version, plugin version, generated file paths, and content hashes. The CLI prints `plan.preview`; it applies only with `--yes` in non-interactive mode. Without required flags, use `@inquirer/prompts` to select a project type, configuration mode, optional preset, and agent mode, then require confirmation.

- [ ] **Step 4: Verify create behavior**

Run: `pnpm vitest run tests/application/create-service.test.ts tests/cli/main.test.ts && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: all tests pass; generated repo contains exactly the two managed files and no framework/application code.

- [ ] **Step 5: Commit**

```bash
git add src/application/create-service.ts src/application/project-state.ts src/cli/main.ts tests/application/create-service.test.ts tests/cli/main.test.ts package.json pnpm-lock.yaml
git commit -m "feat: create managed repositories from reviewed plans"
```

### Task 5: Document CLI use and run clean verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-11-cli-and-create-flow.md`

**Interfaces:**
- Consumes: command behavior from Tasks 1–4.
- Produces: exact command examples and documented intentional limitations.

- [ ] **Step 1: Document executable commands**

Add examples for `pnpm build && node bin/repo.cjs --help`, `repo info`, `repo doctor --project-root .`, and the non-interactive safe command:

```bash
node bin/repo.cjs create demo --type empty --target ./demo --registry ./registry --yes
```

State that framework generation, capability installation, `init`, `add`, `remove`, and updates remain later phases.

- [ ] **Step 2: Run clean verification and inspect scope**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && node bin/repo.cjs --help && git diff --check && git status --short`

Expected: all commands exit `0`; help lists the implemented commands; no whitespace errors.

- [ ] **Step 3: Commit and push**

```bash
git add README.md docs/superpowers
git commit -m "docs: complete CLI and create flow phases"
git push origin main
```

## Plan self-review

### Specification coverage

Task 1 implements Phase 3 help/info; Task 2 implements read-only doctor. Tasks 3–4 implement Phase 4 registry-backed recommended/custom selection, plan preview, non-interactive create, canonical config, and safe managed-state writes. Task 5 documents and verifies the result. Capability execution, generators beyond managed config, and updates remain outside the requested phases.

### Completeness scan

The plan has no unfinished markers or vague steps. Interfaces named by later tasks are introduced by earlier tasks.

### Type consistency

`runCli` is introduced in Task 1 and extended thereafter. `CreateInput`/`CreatePlan` originate in Task 3; `applyCreatePlan` consumes exactly `CreatePlan` in Task 4. Doctor consumes existing config/registry contracts and remains read-only.
