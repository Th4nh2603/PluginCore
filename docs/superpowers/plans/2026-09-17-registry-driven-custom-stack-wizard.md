# Registry-Driven Custom Stack Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `repo create` Custom mode build Monorepo stack selections from Registry metadata, resolve compatibility/dependencies, and show the full resolved composition before generation.

**Architecture:** Extend the manifest schema with ordered project-type stack slots and per-component stack metadata. Add a pure stack resolver in Core; the CLI uses it only to discover valid choices and collect explicit selections, while `resolveCreateComposition` validates/finalizes the stack before planning. Final CLI preview is built from the resolved config plus Registry display metadata so user and auto-resolved choices are visible.

**Tech Stack:** TypeScript 5, Zod, YAML, Vitest, pnpm, existing Registry/Resolver/CLI architecture.

**Spec:** `docs/superpowers/specs/2026-09-17-registry-driven-custom-stack-wizard-design.md`

## Global Constraints

- CLI must not hardcode framework/provider IDs to determine Custom stack choices.
- Only registered and project-compatible stack components may be shown.
- Required dependency selections may be automatic, but every automatic selection must appear in the final summary with its reason.
- Explicit user selections must never be silently overwritten.
- Authentication remains capability-driven and supports None.
- Agents must expose only modes that currently work; Automatic and None are required, unsupported Custom is hidden.
- Recommended and non-interactive create flows must remain backward compatible.
- No placeholder manifests for unsupported frameworks/package managers/testing tools.

---

### Task 1: Manifest contract and built-in metadata

**Files:**
- Modify: `src/core/registry/manifest.ts`
- Modify: `registry/project-types/monorepo/manifest.yaml`
- Modify: `registry/stacks/pnpm-workspaces/manifest.yaml`
- Modify: `registry/stacks/vite/manifest.yaml`
- Modify: `registry/stacks/react/manifest.yaml`
- Modify: `registry/stacks/express/manifest.yaml`
- Modify: `registry/stacks/typescript/manifest.yaml`
- Modify: `registry/stacks/vitest/manifest.yaml`
- Create: `tests/core/registry/manifest-stack.test.ts`
- Modify: `tests/core/registry/builtin-stack-components.test.ts`

**Interfaces:**
- Produces `manifest.stack.slots` for project types and `manifest.stack.slot` / `manifest.stack.compatibleWith` for stack components.

- [ ] Write failing schema tests proving ordered slots parse, component slot metadata parses, and invalid `required + allowNone` is rejected.
- [ ] Run the tests and confirm RED because `stack` is rejected by the strict manifest schema.
- [ ] Add Zod schemas for `StackSlotDefinition`, project stack slots, component stack metadata, and the cross-field slot validation.
- [ ] Add Monorepo slot definitions in this order: `workspace`, `frontend-framework`, `frontend-library`, `backend-framework`, `language`, `testing`.
- [ ] Annotate the six built-in stack components with slot and project-type compatibility metadata.
- [ ] Extend built-in registry tests to assert the six slot assignments.
- [ ] Run manifest/registry tests and confirm GREEN.

### Task 2: Pure stack resolver

**Files:**
- Create: `src/core/resolver/stack-resolver.ts`
- Create: `tests/core/resolver/stack-resolver.test.ts`

**Interfaces:**
- Produces `listStackChoices({ registry, projectType, slot, selected })`.
- Produces `resolveStack({ registry, projectType, selections }) -> StackResolution`.
- `StackResolution.entries` contains `{ slot, id, version, source: "user" | "auto", reason? }` and `stack` contains canonical `id@version` references.

- [ ] Write failing tests for slot choice filtering, optional None, dependency auto-resolution, explicit conflict rejection, compatibility rejection, and dependency cycle rejection.
- [ ] Run resolver test and confirm RED because the module does not exist.
- [ ] Implement the smallest pure resolver that reads only Registry manifests and returns canonical references/provenance.
- [ ] Run resolver tests and confirm GREEN.

### Task 3: Integrate stack resolution into create composition

**Files:**
- Modify: `src/core/resolver/create-resolver.ts`
- Modify: `tests/core/resolver/create-resolver.test.ts`
- Create: `tests/core/resolver/create-resolver-stack.test.ts`

**Interfaces:**
- `CreateResolutionInput.stack` remains `Readonly<Record<string,string>>` for public compatibility.
- `resolveCreateComposition` validates every stack entry through `resolveStack`; preset references and explicit overrides are normalized to canonical references before `RepoConfigSchema.parse`.

- [ ] Write failing tests showing valid Custom Monorepo stack survives into config, wrong-slot component is rejected, and preset stack still resolves unchanged.
- [ ] Run focused tests and confirm RED on the invalid-slot assertion.
- [ ] Integrate `resolveStack` without changing the external `CreateInput` contract.
- [ ] Run create resolver tests and confirm GREEN.

### Task 4: Registry-driven Custom CLI wizard and resolved summary

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `src/cli/presentation.ts`
- Create: `tests/cli/custom-stack-wizard.test.ts`
- Modify: `tests/cli/main.test.ts`
- Modify: `tests/cli/presentation.test.ts`

**Interfaces:**
- Custom wizard iterates `projectType.stack.slots` in manifest order.
- Stack select values are Registry component IDs; `none` is a CLI-only sentinel.
- Authentication choices come from compatible `auth-*` capability manifests plus None.
- Agent choices expose `automatic` and `none` only for this feature.
- Final preview consumes resolved config + Registry metadata and labels automatic selections when provenance exists.

- [ ] Write failing CLI tests asserting Monorepo Custom prompts Workspace → Frontend framework → Frontend library → Backend framework → Language → Testing → Authentication → Agents.
- [ ] Assert unsupported options such as Next.js/NestJS are absent until registered.
- [ ] Assert selected stack is persisted into `repo.config.yaml`, Auth None produces no auth capability, and Agents None writes `mode: none`.
- [ ] Add preview tests for Custom summary and auto-reason suffix.
- [ ] Run focused CLI tests and confirm RED because current Custom only asks Authentication.
- [ ] Implement generic slot iteration using Registry metadata and resolver choice filtering; do not branch on tech IDs.
- [ ] Render final summary before `Install stack` for Custom and Recommended paths.
- [ ] Update legacy CLI tests to the new prompt contract where required.
- [ ] Run all CLI tests and confirm GREEN.

### Task 5: Regression and full verification

**Files:**
- Modify only if a regression test reveals a real compatibility defect.

**Interfaces:**
- No new interfaces.

- [ ] Run `pnpm lint` and require exit 0.
- [ ] Run `pnpm typecheck` and require exit 0.
- [ ] Run `pnpm test` and require 0 failing tests.
- [ ] Run `pnpm build` and require exit 0.
- [ ] Verify Recommended Monorepo, Custom Monorepo, empty project type, and non-interactive `--yes` paths remain covered.
- [ ] Review diff against `main` for unrelated changes.
