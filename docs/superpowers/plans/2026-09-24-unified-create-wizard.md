# Unified Monorepo Create Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interactive `repo create` follow the approved Monorepo mock: choose a starting point, edit individual stack choices, review, then install.

**Architecture:** A focused CLI module owns registry-backed Monorepo editor state and the repeated arrow-key menu. `main.ts` calls it for interactive Monorepo creation, computes the real create plan, and runs a review loop with Install/Edit/Cancel. The existing resolver combines preset values with edited stack and authentication overrides.

**Tech Stack:** TypeScript, `@inquirer/select`, Vitest, existing registry and create-service APIs.

**Spec:** `docs/superpowers/specs/2026-09-24-unified-create-wizard-design.md`

## Global Constraints

- Only interactive Monorepo creation changes; Web, API, Empty, flags, and noninteractive behavior retain their meaning.
- Keep existing `CliPrompt.select` injection so tests and real ↑/↓ terminal navigation follow the same flow.
- No files are written before the final Install selection.
- Do not change resolver or generator unless a failing test proves it necessary.
- Preserve uncommitted changes already present in the working tree; stage only files owned by each task.

## Review Focus

- A custom registry lacks a compatible preset: offer Custom alone and let the editor proceed.
- A category has one option: fill and show its value without opening a one-item submenu.
- A category has no options: fail with exit code 2 before Install, with no files written.
- `--auth` is explicit: show it during review and do not offer Authentication editing.
- Cancel or an invalid menu value: exit 2 and do not create the target directory.

---

### Task 1: Registry-backed Monorepo editor

**Files:**
- Create: `src/cli/monorepo-wizard.ts`
- Create: `tests/cli/monorepo-wizard.test.ts`
- Read: `src/cli/custom-setup.ts`, `src/core/registry/registry-loader.ts`, `src/cli/main.ts`

**Interfaces:**
- Consumes: `Registry`, `ExtensionManifest`, `CliPrompt`, `SelectOption`.
- Produces: `runMonorepoEditor(registry: Registry, prompt: CliPrompt, input: MonorepoEditorInput): Promise<MonorepoSelection | undefined>`; `MonorepoEditorInput` contains optional preset ID, optional explicit authentication, and optional previous selection; `MonorepoSelection` contains optional preset ID, editable `stack` references, authentication provider, `startingPoint`, and `changed`.

- [ ] **Step 1: Write failing editor tests.** Use the real registry and an injected `CliPrompt`. Test Recommended → edit only Frontend to Vue → Continue; Custom → choose all four values; one-option category auto-filled; no compatible preset; zero-option category; invalid menu value. The central behavior assertion is:

```ts
const result = await runMonorepoEditor(registry, prompt, {});
expect(result).toMatchObject({
  preset: "recommended-monorepo",
  stack: { "frontend-library": "vue@3.0.0" },
  authentication: "custom",
  changed: true
});
expect(messages).toEqual(["Start from", "Configure stack", "Frontend", "Configure stack"]);
```

- [ ] **Step 2: Run the focused test and verify RED.** Run `pnpm exec vitest run tests/cli/monorepo-wizard.test.ts`; expect a missing-export or behavior assertion failure.

- [ ] **Step 3: Implement the editor.** Build compatible component choices from the registry; pre-fill editable values from preset keys (`frontend-library`, `backend-framework`, `orm`) and preferred `auth-*` capability; select Custom or Recommended once; then loop over a `Configure stack` menu with four value-labelled rows and Continue. For each row, use `prompt.select(label, choices)` if multiple choices exist, directly fill if exactly one, and report an invalid/incomplete selection as `undefined`. Keep the original preset ID when values change. On `Continue`, return versioned stack overrides only for changed preset categories; for Custom, return all selected editable categories. Preserve previous selection when re-entering after review.

```ts
export interface MonorepoSelection {
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly authentication: string;
  readonly startingPoint: string;
  readonly changed: boolean;
}

const menuValue = await prompt.select("Configure stack", [
  ...editableRows,
  { name: "Continue", value: "continue" }
]);
if (menuValue === "continue") {
  return allRequiredValuesSelected ? selection : undefined;
}
const selectedCategory = editableCategories.find((category) => category.menuValue === menuValue);
if (selectedCategory === undefined) return undefined;
const value = await prompt.select(selectedCategory.label, selectedCategory.choices);
if (!selectedCategory.choices.some((choice) => choice.value === value)) return undefined;
selectedValues[selectedCategory.key] = value;
```

- [ ] **Step 4: Run the focused test and verify GREEN.** Run `pnpm exec vitest run tests/cli/monorepo-wizard.test.ts`; expect 0 failures.
- [ ] **Step 5: Commit only the editor files.** `git add src/cli/monorepo-wizard.ts tests/cli/monorepo-wizard.test.ts && git -c user.name=Codex -c user.email=codex@openai.com commit -m "feat: add editable monorepo selection menu"`.

### Task 2: Review and install orchestration

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `src/cli/presentation.ts`
- Modify: `tests/cli/recommended-wizard.test.ts`
- Modify: `tests/cli/custom-wizard.test.ts`
- Modify: `tests/cli/presentation.test.ts`
- Modify: `docs/cli-create-wizard.md`

**Interfaces:**
- Consumes: `runMonorepoEditor` and `MonorepoSelection` from Task 1; `planCreate` and `applyCreatePlan` unchanged.
- Produces: a Monorepo review view and final `Install | Edit stack | Cancel` selection; other project types retain existing path.

- [ ] **Step 1: Write failing integration tests.** Replace old branch-specific Monorepo expectations with tests that exercise `Start from` → `Configure stack` → one edited category → Review → Install. Assert the generated `repo.config.yaml` retains `composition.preset` and has the changed stack reference; add tests for Authentication-only change, `Edit stack` re-entry, Cancel, invalid choice, `--auth` lock, and noninteractive `--yes`. Keep Web/API/Empty assertions in place.

```ts
expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
expect(config.composition.stack["frontend-library"]).toBe("vue@3.0.0");
expect(config.composition.authentication).toBe("clerk");
expect(existsSync(targetDirectory)).toBe(true);
```

- [ ] **Step 2: Run relevant tests and verify RED.** Run `pnpm exec vitest run tests/cli/recommended-wizard.test.ts tests/cli/custom-wizard.test.ts tests/cli/presentation.test.ts`; expect wizard prompt or review assertions to fail.

- [ ] **Step 3: Implement the Monorepo branch and review formatter.** In `main.ts`, call the new editor only when the command is interactive and `projectType === "monorepo"`. Validate explicit `--auth` as today. Build `planCreate` from returned preset, overrides, and authentication, then print a review assembled from the resolved plan config plus starting-point/changed context. Prompt with `Install`, `Edit stack`, `Cancel`; on Edit, re-enter the editor with its previous selection and rebuild the plan. Return 2 without writing on invalid selection or Cancel. Keep the existing non-Monorepo and noninteractive branches intact. Avoid duplicate preview output.

```ts
const action = await interactive.select("Review", [
  { name: "Install", value: "install", tone: "success" },
  { name: "Edit stack", value: "edit", tone: "custom" },
  { name: "Cancel", value: "cancel" }
]);
if (action === "edit") continue;
if (action !== "install") return 2;
await applyCreatePlan(plan, io.generatorRunner);
```

- [ ] **Step 4: Update the flow document.** Replace the old Monorepo Recommended/Custom branch description in `docs/cli-create-wizard.md` with the new three-stage flow; retain accurate Web/API/Empty and flag behavior.
- [ ] **Step 5: Run focused tests and verify GREEN.** Run `pnpm exec vitest run tests/cli/recommended-wizard.test.ts tests/cli/custom-wizard.test.ts tests/cli/presentation.test.ts`; expect 0 failures.
- [ ] **Step 6: Commit only Task 2 files.** Stage the six paths above and commit `feat: unify monorepo create wizard` with the local Codex author identity; do not stage unrelated working-tree changes.

### Task 3: Full verification and terminal exercise

**Files:**
- Inspect: all Task 1–2 files and `bin/repo.cjs`
- Modify only if verification reveals a concrete failure, following a new RED/GREEN test cycle.

**Interfaces:** No new exported interfaces.

- [ ] **Step 1: Run full automated checks.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`; record exit codes and address failures caused by these changes.
- [ ] **Step 2: Exercise the real CLI in a disposable directory.** Use the linked `repo` command in a PTY, choose Monorepo → Recommended → change one category → review → Cancel and confirm no target directory exists; repeat through Install with a stubbed generator only if necessary to avoid external dependency installation. Check the displayed arrow-key menu and final config.
- [ ] **Step 3: Review the spec line by line.** Check preset editing, Custom completion, review/edit loop, cancellation, flags, one/zero-choice categories, and preservation of other project types against test evidence. Report any remaining limit explicitly.
