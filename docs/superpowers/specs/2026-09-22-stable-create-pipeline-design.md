# Stable Create Pipeline Design

## Status

Design approved in conversation on 2026-09-22. This specification defines a safe execution lifecycle for `repo create`.

## Goal

`repo create` must report success only after the generated repository has passed concrete verification. If any part of creation fails after the CLI takes ownership of the target directory, the entire target directory must be removed.

## Scope

This change strengthens the existing execution pipeline. It does not add dependency installation, build, or test execution to generated projects.

## Decisions

- A target directory that already exists is rejected before execution and is never removed.
- The execution layer, rather than the application service, owns creation lifecycle and rollback.
- Rollback removes the complete target directory that the pipeline created.
- Generators report the relative paths of files they created.
- Verification occurs in two phases:
  1. Before state recording, verify generator-reported files and schema-validate `repo.config.yaml`.
  2. After state recording, verify that managed state exists, parses, and records a hash matching the validated configuration.
- Managed state is written only after successful primary verification.

## Architecture

`applyCreatePlan` remains an orchestration boundary. It delegates plan execution to a transactional executor in `src/execution/`.

```text
validate target does not exist
  -> generate
  -> write repo.config.yaml
  -> primary verification
  -> write managed-state.yaml
  -> final verification
  -> success

any failure after target creation
  -> rollback target directory
  -> surface failure
```

The executor owns a memory-only `CreateTransaction` containing the normalized target directory, whether the pipeline owns it, and generated file metadata. No journal must be persisted for this scope.

## Contracts

### Generation result

The generate handler changes from returning `Promise<void>` to returning a `GenerationResult`.

```ts
interface GenerationResult {
  readonly files: readonly string[];
}
```

Each path is relative to the target directory. The executor validates that paths are non-empty, unique, and cannot escape the target. Directory paths are not reported as managed outputs for this contract.

### Primary verification

After generation and config writing, the verifier must:

1. confirm every reported generated path exists and is a file;
2. confirm `repo.config.yaml` exists;
3. parse and schema-validate the config; and
4. return the validated config or fail with a stable repository error.

### Final verification

After writing `.repo-standard/managed-state.yaml`, the verifier must confirm that the file exists, parses, and has a config hash matching the validated configuration. The pipeline cannot succeed without this final check.

Generator-reported files are verification inputs only in this change. Expanding the persisted managed-state schema to record every generated file is deferred.

## Failure and rollback behavior

Failures in generation, configuration writing, either verification phase, or state writing trigger rollback when the pipeline owns the target. Rollback deletes only the normalized target directory that was validated as absent before execution.

If rollback succeeds, the original failure is rethrown so CLI diagnostics retain the actual cause. If rollback itself fails, surface a stable `CREATE_ROLLBACK_FAILED` error with the original error as its cause and the remaining target path as diagnostic context. The CLI must never return a successful result in either situation.

## Testing

Add tests covering:

- successful creation and both verification phases;
- failure after partial generator output;
- configuration-write failure;
- missing generator-reported file;
- invalid generated config;
- state-write or final-verification failure;
- a pre-existing target directory remaining untouched; and
- rollback failure preserving the original cause and reporting the target.

Existing create, executor, CLI, lint, typecheck, test, and build checks remain required.

## Acceptance criteria

1. Successful CLI output is emitted only after final managed-state verification.
2. A failure after target ownership removes the complete target directory when cleanup succeeds.
3. Existing target directories are never modified or removed.
4. Primary verification validates generator outputs and `repo.config.yaml` before state recording.
5. Final verification validates managed state and configuration hash.
6. Rollback failures produce a stable error and retain the primary failure as context.
