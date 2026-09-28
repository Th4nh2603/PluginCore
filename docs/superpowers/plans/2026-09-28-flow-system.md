# Phase 6 implementation plan

**Status:** Implemented on `feat/phase-6-flows`. Final checks: lint, typecheck, 176 tests, and build passed.

## Task 1: Manifest contract and initial catalog

- Add `flow` schema to `ExtensionManifestSchema` with validated intents, ordered steps, inputs, outcome, expertise, and `policy.requiresReview` condition.
- Add feature, bugfix, design, and review manifests. Test registry loading and malformed flow rejection.

## Task 2: Selection and explanation

- Export the existing task intent classifier for shared use.
- Add `resolveFlow` with explicit/default selection, compatibility checks, conditional step explanations, and expertise aggregation.
- Test each intent, override, omission, unavailable flow, and design without implementation.

## Task 3: Creation and agent integration

- Store compatible flow IDs in generated `flows.defaults`.
- Pass selected flow expertise into task-based agent resolution, requiring a compatible agent per expertise tag.
- Test generated config and required agent coverage, including `none` mode.

## Task 4: CLI and documentation

- Add `repo flows explain` and feed the same flow result into `repo agents explain`.
- Document commands and policy flag. Test end-to-end output and invalid selection.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; review the diff and commit.
