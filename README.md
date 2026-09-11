# Repository Standard Plugin

An extension-driven developer-tooling platform for creating and managing repositories with shared, safe engineering standards.

## Current phase

Phase 2 establishes the TypeScript core foundation. It does not yet expose a `repo` CLI, generate projects, execute capability lifecycles, or connect to external AI-agent hosts.

## Supported core modules

- `src/core/config`: validates and loads the canonical `repo.config.yaml`; plaintext secret-like values are rejected.
- `src/core/registry`: discovers, validates, and indexes declarative extension manifests by `kind:id`.
- `src/core/security`: prevents paths from escaping an approved project root.
- `src/core/resolver`: defines pure resolution-plan contracts and reports unresolved required extensions.

No CLI command, repository generator, capability installer, update engine, or external adapter is implemented in this phase.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Design references

- [Architecture specification](docs/superpowers/specs/2026-09-10-repository-standard-plugin-design.md)
- [Phase 2 implementation plan](docs/superpowers/plans/2026-09-11-core-scaffold.md)
