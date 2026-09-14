# Monorepo Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recommended Monorepo preset create a runnable pnpm workspace with Web, API, and shared packages.

**Architecture:** Extend `applyCreatePlan` with a focused Monorepo scaffold path selected from `plan.config.project.type`. It writes workspace metadata, API and shared-package sources, delegates `apps/web` creation to the existing `GeneratorRunner`, then installs workspace dependencies from the root.

**Tech Stack:** Node.js, TypeScript, pnpm workspaces, Vite 8 + React 19, Express 5, Vitest.

**Spec:** User-approved design from the 2026-09-14 conversation: `apps/web` (Vite + React), `apps/api` (Express), `packages/shared` (TypeScript), managed by pnpm workspaces.

## Global Constraints

- Keep `GeneratorRunner` as the process-execution dependency boundary.
- Preserve the existing standalone Vite generator behavior.
- Use `pnpm.cmd` on Windows and `pnpm` elsewhere.
- Preserve root `repo.config.yaml` and `.repo-standard/managed-state.yaml`.

---

### Task 1: Scaffold workspace files

**Files:**

- Modify: `src/application/create-service.ts`
- Test: `tests/application/create-service.test.ts`

**Interfaces:**

- Consumes: `CreatePlan.config.project.type`, `CreatePlan.targetDirectory`.
- Produces: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`; API and shared package manifests, TypeScript configs, and starter source files.

- [ ] **Step 1: Write the failing test**

```ts
expect(existsSync(path.join(targetDirectory, "pnpm-workspace.yaml"))).toBe(true);
expect(await readFile(path.join(targetDirectory, "apps", "api", "src", "server.ts"), "utf8")).toContain("express");
expect(await readFile(path.join(targetDirectory, "packages", "shared", "src", "index.ts"), "utf8")).toContain("export");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/application/create-service.test.ts`

Expected: FAIL because Monorepo files do not exist.

- [ ] **Step 3: Write minimal implementation**

Write a private scaffold helper. The API exposes `GET /health`; root scripts include `dev`, `dev:web`, `dev:api`, `build`, and `test`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/application/create-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/application/create-service.ts tests/application/create-service.test.ts
git commit -m "feat: scaffold monorepo workspace files"
```

### Task 2: Generate Web and install dependencies

**Files:**

- Modify: `src/application/create-service.ts`
- Test: `tests/application/create-service.test.ts`

**Interfaces:**

- Consumes: `GeneratorRunner.run(command, args, cwd)`.
- Produces: Vite creation at `apps/web`, then `pnpm install` at the Monorepo root.

- [ ] **Step 1: Write the failing test**

```ts
expect(commands).toEqual([
  [pnpm, "create", "vite", "apps/web", "--template", "react-ts", "--no-interactive", targetDirectory],
  [pnpm, "install", targetDirectory]
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/application/create-service.test.ts`

Expected: FAIL because the existing generator only recognizes standalone Vite projects.

- [ ] **Step 3: Write minimal implementation**

Run Vite from the Monorepo root, then install at that root. Keep standalone Vite commands unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/application/create-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/application/create-service.ts tests/application/create-service.test.ts
git commit -m "feat: generate monorepo web workspace"
```

### Task 3: Show Monorepo handoff guidance

**Files:**

- Modify: `src/cli/main.ts`
- Test: `tests/cli/main.test.ts`

**Interfaces:**

- Consumes: completed `CreatePlan`.
- Produces: workspace paths and `pnpm dev` guidance after successful Monorepo creation.

- [ ] **Step 1: Write the failing test**

```ts
expect(output.join("\n")).toContain("pnpm dev");
expect(output.join("\n")).toContain("apps/web");
expect(output.join("\n")).toContain("apps/api");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cli/main.test.ts`

Expected: FAIL because create currently prints only `Created <target>.`.

- [ ] **Step 3: Write minimal implementation**

Print the three workspace paths and startup command only for a successful Monorepo create.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cli/main.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/cli/main.ts tests/cli/main.test.ts
git commit -m "feat: show monorepo startup guidance"
```

### Task 4: Verify and commit

**Files:**

- Verify: `src/application/create-service.ts`, `src/cli/main.ts`, their tests.

- [ ] **Step 1: Run full verification**

Run: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

Expected: all commands succeed with no whitespace errors.

- [ ] **Step 2: Commit the feature and plan**

```powershell
git add docs/superpowers/plans/2026-09-14-monorepo-generator.md
git commit -m "docs: plan monorepo generator"
```
