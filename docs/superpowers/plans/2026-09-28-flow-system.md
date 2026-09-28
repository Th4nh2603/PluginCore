# Phase 6 implementation plan

**Status:** Implemented and merged into `main` at `98af304`. On the merged checkout, lint, typecheck, 191 tests, and build passed with the existing local changes restored.

## Task 1: Manifest contract and initial catalog

- [x] Add `flow` schema to `ExtensionManifestSchema` with validated intents, ordered steps, inputs, outcome, expertise, and `policy.requiresReview` condition.
- [x] Add feature, bugfix, design, and review manifests. Test registry loading and malformed flow rejection.

## Task 2: Selection and explanation

- [x] Export the existing task intent classifier for shared use.
- [x] Add `resolveFlow` with explicit/default selection, compatibility checks, conditional step explanations, and expertise aggregation.
- [x] Test each intent, override, omission, unavailable flow, and design without implementation.

## Task 3: Creation and agent integration

- [x] Store compatible flow IDs in generated `flows.defaults`.
- [x] Pass selected flow expertise into task-based agent resolution, requiring a compatible agent per expertise tag.
- [x] Test generated config and required agent coverage, including `none` mode.

## Task 4: CLI and documentation

- [x] Add `repo flows explain` and feed the same flow result into `repo agents explain`.
- [x] Document commands and policy flag. Test end-to-end output and invalid selection.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; review the diff and commit.
