# Repository Standard Plugin — Phase 1 Architecture

## Status and scope

This document is the Phase 1 architecture decision for the Repository Standard Plugin (the **plugin**). It is written for plugin maintainers, extension authors, project teams, and AI-agent integrations. It defines the platform boundaries required before implementation.

Phase 1 deliberately contains no runtime scaffold, package manager setup, dependencies, sample application, or executable command. Phase 2 starts only after this document is reviewed and approved.

### Goals

- One stable core supports many project types, technology stacks, capabilities, AI coding agents, and managed repositories.
- A developer can create a repository interactively or non-interactively, review the proposed configuration, and receive one canonical `repo.config.yaml`.
- Recommended choices are data-driven presets, never core dependencies.
- Agent selection is task- and context-aware; unrelated specialists are not loaded.
- Project teams can override standards without forking the plugin.
- Updates are versioned, previewable, and conflict-safe; they never blindly overwrite project-owned code.

### Non-goals for the MVP

- A universal implementation for every framework, cloud, database, or AI agent.
- Running all SDLC stages for every request.
- Arbitrary shell hooks supplied by untrusted manifests.
- Automatic removal of files that may contain project edits.
- Deploying generated projects.

## 1. Architecture overview

The plugin is a developer-tooling platform, not a library embedded in generated applications. Its core reads declarative extension manifests, validates them, resolves a compatible plan, and invokes explicit adapters/generators. It does not contain framework-, provider-, or AI-vendor-specific rules.

```text
Developer / automation
        |
        v
CLI command (create, init, add, doctor, update, agent, flow)
        |
        v
Application service layer
  | configuration | registry | policy | planning | managed-state |
        |
        v
Resolvers (project type, preset, stack, capability, flow, agent)
        |
        +--> extension registry manifests
        +--> project repo.config.yaml + .repo-standard/overrides/
        |
        v
Execution adapters and template generators
        |
        v
Managed repository + provider-specific AI-agent files
```

The design has two persistent data sources:

1. The installed plugin distribution supplies **shared standards and extension manifests**.
2. Each managed repository supplies **`repo.config.yaml`, project-owned override files, and managed-state metadata**.

The core turns those sources into an immutable, validated resolution plan before any write. Executors receive that plan; they do not re-resolve configuration independently.

## 2. Core responsibilities

The core owns generic mechanics only:

- discover, load, schema-validate, and version extension manifests;
- parse and validate the project configuration;
- merge policies under explicit precedence rules;
- check extension compatibility and dependency constraints;
- resolve presets, agents, flows, and capability lifecycle plans;
- render known templates through a restricted template API;
- plan, preview, apply, verify, and record managed changes;
- protect repository boundaries, paths, secrets, and child-process arguments;
- expose stable CLI/application-service contracts.

The core must not know that a particular framework, auth provider, database, CI system, or AI coding agent exists. Such knowledge belongs in a registry extension, capability, preset, or adapter.

## 3. Module boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| CLI | argument parsing, prompts, presentation, exit codes | resolution rules or direct filesystem mutations outside application services |
| Config | `repo.config.yaml` parsing, schema validation, normalization | stack-specific detection/install logic |
| Registry | extension discovery, manifest validation, indexes, version selection | prompt UX or mutation of project configuration |
| Policy engine | precedence, merge semantics, policy diagnostics | task classification or provider integration |
| Resolvers | deterministic selection plans from validated inputs | interactive prompts, file writes, arbitrary commands |
| Planner | explicit change plan, dependency order, dry-run output | untracked destructive mutations |
| Generator | safe template rendering and managed-file manifests | registry selection policy |
| Update engine | version comparison, migration sequencing, conflict analysis, rollback journal | editing project-owned files |
| Agent orchestration | task classification, flow selection, required expertise plan | implementation by every listed agent |
| Agent adapters | translate shared agent definitions to host-specific files | duplicate shared policies or redefine resolver decisions |
| Doctor | read-only health checks and actionable diagnostics | silent repair |

Every boundary is expressed as typed data contracts. Core services depend on interfaces, while extensions depend only on published extension schemas and the constrained execution API.

## 4. Proposed repository tree

The future implementation repository is organized by ownership and extension surface rather than by a framework sample:

```text
repo-standard-plugin/
├── src/
│   ├── cli/                         # command presentation and prompts
│   ├── application/                 # use cases: create/init/add/doctor/update
│   ├── core/
│   │   ├── config/
│   │   ├── registry/
│   │   ├── policy/
│   │   ├── resolver/
│   │   ├── planning/
│   │   ├── generation/
│   │   ├── managed-state/
│   │   ├── update/
│   │   ├── validation/
│   │   └── security/
│   ├── adapters/                    # host-agent and integration adapters
│   └── shared/                      # errors, result types, filesystem abstractions
├── registry/
│   ├── project-types/
│   ├── stacks/
│   ├── capabilities/
│   ├── agents/
│   ├── flows/
│   ├── policies/
│   └── presets/
├── standards/
│   ├── agents/                      # host-neutral agent definitions
│   ├── flows/
│   └── policies/
├── templates/                       # data templates referenced by extensions
├── schemas/                         # versioned public manifest schemas
├── migrations/                      # plugin-to-project migrations
├── docs/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── contract/
└── package metadata and repository tooling (Phase 2)
```

`registry/` is distributable content, while `standards/` contains reusable, provider-neutral policy and agent material. Adapters translate that material for each host. A stack extension may reference a template and policies, but no template is selected by the core without a resolved extension plan.

## 5. Complete `repo create` UX

`repo create <name>` is interactive by default. It accepts non-interactive equivalents such as `--type`, `--preset`, `--stack`, `--capability`, `--agents`, and `--yes`; flags carry extension IDs rather than framework-specific core flags.

1. Validate `<name>` and target path; refuse a non-empty target unless an explicit future-safe mode supports it.
2. Choose an extensible project type from the registry.
3. Select **Recommended** or **Custom** configuration.
4. In Recommended mode, resolve the type's default preset, display every selection and policy implication, then offer **Use**, **Customize**, or **Back**. The preset is never applied before review.
5. In Custom mode, use the selected project type's category schema to ask only relevant questions (for example, no UI choice for a CLI).
6. Resolve optional capabilities, showing compatibility, dependencies, and required configuration.
7. Select AI-agent setup: `automatic` (default), `recommended`, `custom`, or `none`.
8. Select development-flow defaults and optional Git/CI integrations offered by registry entries.
9. Present an immutable repository plan: configuration, extensions, generated/managed files, commands that would run, and unresolved required values.
10. On confirmation, create the repository boundary, write `repo.config.yaml`, generate only the approved managed files, run extension verification, record managed state, and print the next steps.

If verification fails, the command reports the failure and preserves a transaction journal for a future rollback/recovery command. It never logs secrets.

## 6. Project configuration schema

`repo.config.yaml` is the single source of truth for decisions shared by CLI, doctor, updater, capability resolver, and agent resolver. It stores stable extension IDs and explicit versions/ranges, not duplicated implementation details.

```yaml
schemaVersion: 1
plugin:
  id: repo-standard
  version: 0.1.0

project:
  name: example
  type: web-application
  root: .

composition:
  preset: recommended-web@1
  stack:
    runtime: nodejs@22
    language: typescript@5
    framework: example-web-framework@1
    packageManager: pnpm@9
  capabilities:
    - id: example-auth
      version: 1
      configRef: .repo-standard/capabilities/example-auth.yaml

agents:
  mode: automatic
  enabled: []                    # only used by recommended/custom modes
  adapters: [codex]

flows:
  defaults: [feature, bugfix, review]

integrations:
  git: github-flow@1
  ci: example-ci@1

standards:
  overrides:
    - .repo-standard/overrides/*.yaml

managed:
  stateFile: .repo-standard/managed-state.yaml
```

Only structural identity and selected extension references live here. Capability-specific non-secret settings live in referenced project-owned files. Secrets are environment references or secret-manager references, never plaintext configuration. Schema upgrades are explicit migrations.

## 7. Registry architecture

An extension is a directory containing a versioned manifest plus optional templates, policies, documentation, and restricted lifecycle declarations. The registry loader scans supported roots, validates manifests against schemas, builds indexes by ID/type/version, then rejects ambiguous or incompatible selections.

Every manifest provides: `id`, `kind`, semantic `version`, display metadata, compatibility predicates, dependencies, policy references, and optional implementation references. Kinds include `project-type`, `stack-component`, `preset`, `capability`, `agent`, `flow`, `integration`, and `adapter`.

Compatibility predicates are declarative constraints over project type, selected stack components, plugin schema version, and other capabilities. They are evaluated by core; manifests cannot supply arbitrary executable resolver code. The extensibility boundary is therefore data-first and schema-controlled.

### Adding a new tech stack without changing Core

An extension author adds stack-component manifests for the relevant categories, a project-type compatibility declaration, optional templates/policies, and optionally a preset that selects them. The core already discovers components, validates their constraints, presents category choices, and passes the resolved plan to a generator. No core switch statement changes. A new runtime/framework needing bespoke generation uses a declared generator adapter implementing the stable generator contract, not a new core branch.

## 8. Preset architecture

A preset is a named, versioned composition of extension IDs plus optional policy defaults. It has a target project-type compatibility declaration and may mark items as required, recommended, or configurable.

```yaml
id: recommended-web
kind: preset
version: 1.0.0
projectTypes: [web-application]
selection:
  stack:
    runtime: nodejs@22
    language: typescript@5
    framework: example-web-framework@1
  capabilities:
    - example-ui@1
  integrations:
    git: github-flow@1
review:
  allowCustomize: true
```

Presets are suggestions. The resolver validates them exactly as it validates a custom composition and returns a reviewable plan. Replacing a recommended preset changes registry content, not core behavior.

## 9. Agent and sub-agent contract

An **agent** is a broad responsibility (Architect, Frontend, Backend, Data, Testing, Security, Reviewer). A **skill** is a focused procedure/knowledge unit. A **capability** is an installable project integration. The three are separate registry kinds.

Shared agent definitions declare expertise tags, task-intent affinity, activation signals, constraints, expected inputs, expected outputs, and whether the role may implement or is review-only. The built-in Reviewer contract is review-only by default and receives the implementation plan/diff independently from implementers.

```yaml
id: security
kind: agent
version: 1
expertise: [authentication, authorization, secrets, input-validation]
activation:
  intents: [feature, bugfix, review, security]
  signals: [auth, payment, permissions, secret, public-api]
outputs: [security-findings]
execution: advisory
```

Host adapters render a shared agent definition into host-specific files, such as `AGENTS.md` or Codex/Claude/Cursor configuration. Shared standards stay canonical; adapters contain translation only.

## 10. Agent Resolver algorithm

The resolver produces a ranked, explainable set of required and recommended agents. It does not execute them.

1. Normalize the user request and inspect `repo.config.yaml`, active overrides, selected stack, enabled capabilities, and the target change context if available.
2. Classify intent using a scored model of task semantics and repository context: `feature`, `bugfix`, `refactor`, `design`, `review`, `test`, `security`, `git`, `release`, or explicit `full-sdlc`. Keywords are only signals; target files, requested outcome, and capability metadata contribute evidence.
3. Select the minimum compatible flow. Full SDLC is selected only on explicit request.
4. Extract required expertise from the flow, project type, stack component agent hints, capability agent hints, policy obligations, and risk signals.
5. Apply hard rules first: a declared required specialist or a security policy requirement cannot be removed. Apply project overrides next within their permitted scope.
6. Score candidate agents by expertise coverage, intent affinity, target ownership, risk, and configured mode. Remove agents with no relevant evidence.
7. Produce required agents, optional/recommended agents, rationale, evidence, and conflicts. Automatic mode selects the required minimum; recommended mode displays the computed set; custom mode lets the user alter optional entries but validates hard requirements.

For a button-padding request in a frontend target, the plan can be only `Frontend` plus project-required testing. For authentication or authorization work, capability/policy signals add `Security`, usually `Backend`, `Frontend`, and `Testing`; `Architect` is included only when the complexity threshold or changed boundaries justify it. The Reviewer is scheduled after implementation when the chosen flow requires review, and does not self-fix.

## 11. Flow contract

Flows are declarative state-machine-like process definitions independent of agent identities. Each step defines required inputs, outcome, optionality condition, policy gates, and required expertise tags.

```yaml
id: bugfix
kind: flow
version: 1
steps:
  - id: reproduce
    outcome: reproducible-case
  - id: investigate
    outcome: root-cause
  - id: fix
    outcome: proposed-change
  - id: regression-test
    outcome: verification-result
  - id: review
    condition: policy.requiresReview
    expertise: [reviewer]
```

Initial flows are `feature`, `bugfix`, `design`, and `review`. The flow resolver may omit conditionally unnecessary steps for small tasks, but it must record why. The design flow never implies implementation.

## 12. Capability contract

A capability is a versioned optional integration with a declarative lifecycle. It includes compatibility/dependency rules, configuration schema, policy references, agent hints, templates, and named lifecycle actions (`plan`, `install`, `verify`, `uninstall`). Actions map to allowlisted adapter operations, not arbitrary manifest shell scripts.

```yaml
id: example-auth
kind: capability
version: 1.0.0
type: authentication
supports:
  projectTypes: [web-application]
dependencies: []
agentHints:
  required: [security]
  recommended: [backend, frontend, testing]
lifecycle:
  installer: example-auth-installer@1
  verifier: example-auth-verifier@1
```

### Adding a capability without changing Core

An author adds a capability manifest and its lifecycle adapter/templates. Registry discovery and compatibility validation are generic. The resolver uses the manifest's compatibility and agent-hint metadata, and the planner invokes the adapter through its stable, restricted contract. No core capability-name branch is introduced.

## 13. Adapter contract

Adapters bridge stable core plans to external systems. Types include generator adapters, package-manager adapters, VCS/CI adapters, capability lifecycle adapters, and AI-agent host adapters.

An adapter receives a validated context containing repository root, selected extension references, normalized config, plan operations, and a structured logger with secret redaction. It returns structured operations/results; it may execute only allowlisted operations under a checked project root. It cannot access an arbitrary shell string originating from a manifest.

Adapters are versioned and compatibility-tested against schemas. A generic adapter is the fallback where no host-specific representation is needed.

## 14. Managed versus project-owned files

| Class | Examples | Update behavior |
| --- | --- | --- |
| Plugin distribution | registries, shared policies, shared agent definitions, adapters, templates | updated by plugin installation, outside project source tree |
| Plugin-managed in project | generated agent-host files, selected CI files, `.repo-standard/managed-state.yaml` | tracked with generator ID, plugin/extension version, content hash, and base snapshot/reference |
| Project-owned | application code, `repo.config.yaml`, project docs, capability config, `.repo-standard/overrides/**` | never blindly overwritten |
| Shared/merge-aware | explicitly declared generated config fragments | updated only with a format-aware merger or a conflict report |

Managed state records file path, owning extension, rendered-content hash, last applied version, and optional base content hash. This enables the updater to distinguish an unchanged managed file from a project modification.

## 15. Override precedence and safe customization

Policy/configuration precedence, from lowest to highest, is:

```text
Core baseline
  < Project type policy
  < Stack policy
  < Capability policy
  < Project override
  < Task instruction
```

Each policy key declares a merge strategy: `replace`, `append-unique`, `intersect`, `tighten-only`, or `forbid-override`. A project cannot weaken a `tighten-only` security floor or override a `forbid-override` safety boundary. Task instructions are ephemeral: they change the current resolution plan but are not persisted unless the user explicitly writes an override.

Project overrides live in `.repo-standard/overrides/` and reference stable policy/extension IDs. The doctor reports unknown, stale, incompatible, and rejected overrides with the reason and source layer. This lets a project customize standards safely without a fork.

## 16. Update and versioning strategy

The plugin and every extension use Semantic Versioning. Project configuration pins or constrains compatible extension versions. Breaking schema or behavior changes require a migration entry.

`repo update --check` builds a no-write update plan containing version changes, migrations, managed-file diffs, compatibility failures, and conflicts. `repo update` applies only an approved plan, writes a transaction journal, verifies outcomes, and records the new state. Changed project-owned or modified managed files yield conflicts; they are never overwritten. Migrations are versioned, ordered, idempotent where feasible, and exposed as named adapters with preview output.

Recovery is journal-based: a failed transaction reports completed operations and offers a supported rollback only for files/dependencies known to be plugin-managed. A backup policy can be added as an integration, not assumed by Core.

## 17. Security and validation model

- Resolve paths to absolute paths and reject anything outside the approved project root.
- Validate all manifests and configurations before planning; reject unknown schema versions by default.
- Use argument arrays and allowlisted executables for child processes; do not invoke a shell for manifest-provided commands.
- Redact secret values and secret-like keys in logs, plans, diagnostics, and errors.
- Require explicit preview/confirmation before mutation in interactive commands.
- Use atomic writes where supported and retain transaction state for recovery.
- Treat registry content and adapters as trusted, installed plugin content; do not execute arbitrary project-provided manifest code.

## 18. MVP scope

The MVP proves the architecture with a limited catalog and no hardcoded sample technology in Core:

- TypeScript implementation foundation and schema validation.
- Registry loading for project types, stack components, presets, agents, flows, and one sample capability.
- `repo info`, `repo doctor`, and `repo create` with one or a small number of extension-provided sample project adapters.
- Recommended and custom composition, plan preview, `repo.config.yaml`, and safe managed-state recording.
- Automatic, recommended, custom, and none agent modes.
- Built-in role definitions: Architect, Frontend, Backend, Data, Testing, Security, Reviewer.
- Agent resolver tests proving irrelevant specialists are excluded and authentication-sensitive work considers Security.
- Initial feature, bugfix, design, and review flows.

`repo init`, `repo add`, `repo remove`, a complete updater, Git/CI adapters, and broader catalogs are planned after the MVP contracts have been proven. Their command names remain reserved, but they are not represented as falsely complete functionality.

## 19. Implementation roadmap

1. **Phase 1 — Architecture:** this specification; review and approve.
2. **Phase 2 — Core scaffold:** repository tooling, typed contracts, config parser, registry loader, resolver interfaces, validation/security foundations, and unit tests.
3. **Phase 3 — CLI foundation:** help, `info`, read-only `doctor`, structured diagnostics, and fixtures.
4. **Phase 4 — Create flow:** interactive/non-interactive composition, plan preview, one extension-provided generator, safe configuration/state writes, and integration tests.
5. **Phase 5 — Agent system:** shared agent catalog, resolver, modes, host-adapter contract, and explanation output.
6. **Phase 6 — Flow system:** initial declarative flows and flow-selection integration.
7. **Phase 7 — Capability system:** capability schema, compatibility resolver, one safe lifecycle adapter, planning, installation, and verification.
8. **Phase 8 — Update system:** managed file tracking, dry-run planning, conflict detection, migrations, journal/recovery.
9. **Phase 9 — Git and CI adapters:** initial provider integrations delivered entirely as adapters.

Each phase has contract tests before broadening the extension catalog. New project types, stacks, capabilities, and agent hosts are added as independently versioned registry/adapters, not by modifying resolver conditionals.

## 20. Architecture acceptance criteria

This design is acceptable when implementation can demonstrate:

- one core loading multiple project types, stacks, capabilities, AI-agent adapters, and repository configurations;
- optional, reviewable recommended presets;
- an explainable dynamic agent set selected from task context rather than a fixed pipeline;
- an extension author adding a stack or capability through manifests/adapters without a core code change;
- safe project-level policy overrides with known merge semantics and protected safety floors;
- an updater that previews changes and protects project-owned or modified files.
