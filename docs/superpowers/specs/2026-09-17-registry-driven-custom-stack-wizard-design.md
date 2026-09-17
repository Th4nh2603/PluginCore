# Registry-Driven Custom Stack Wizard Design

## Goal

Make `repo create` support a real `Custom` flow for Monorepo without hardcoding framework choices in the CLI. The Registry defines stack slots, available components, compatibility, and required dependencies. The CLI renders those choices, the resolver produces the final composition, and the final preview shows both user-selected and automatically resolved components before generation.

## User Experience

For `monorepo`, the interactive flow is:

```text
? Setup
  ★ Recommended
> Custom

? Workspace
> pnpm
  npm
  yarn

? Frontend framework
> Vite
  Next.js
  None

? Frontend library
> React
  Vue
  Svelte

? Backend framework
> Express
  NestJS
  Fastify
  None

? Language
> TypeScript
  JavaScript

? Testing
> Vitest
  Jest
  None

? Authentication
> Custom Authentication
  Clerk
  None

? Agents
> Automatic
  Custom
  None
```

Only choices actually registered and supported by PluginCore are shown. Therefore the initial implementation will expose the currently implemented stack components only; future components such as Next.js, Vue, NestJS, Fastify, Jest, npm, and yarn become visible automatically when their manifests and execution support are added.

The final preview is mandatory before generation and must include automatic decisions:

```text
Custom Monorepo
────────────────────────────────────
Workspace        pnpm Workspaces
Frontend         Vite
UI Library       React
Backend          Express
Language         TypeScript
Testing          Vitest
Authentication   Custom Authentication
Agents           Automatic
────────────────────────────────────
```

When a component is selected automatically because another component requires it, the preview shows the provenance:

```text
UI Library       React (auto: required by Next.js)
```

The resolver may auto-resolve required dependencies, but no automatic decision may remain invisible to the user.

## Architectural Principles

1. CLI is presentation only. It must not contain framework/provider IDs such as `vite`, `react`, `express`, `clerk`, or future equivalents to determine available options.
2. Registry is the source of truth for stack slots and stack components.
3. Resolver owns dependency and compatibility decisions.
4. The final resolved composition, not raw user clicks, is the source of truth for preview and generation.
5. Unsupported options are never shown.
6. Existing non-interactive flags and Recommended flow remain backward compatible.

## Manifest Contract

### Project Type Stack Slots

A project-type manifest can declare ordered stack slots:

```yaml
schemaVersion: 1
id: monorepo
kind: project-type
version: 1.0.0
displayName: Monorepo
stack:
  slots:
    - id: workspace
      label: Workspace
      required: true
    - id: frontend-framework
      label: Frontend framework
      allowNone: true
    - id: frontend-library
      label: Frontend library
      allowNone: true
    - id: backend-framework
      label: Backend framework
      allowNone: true
    - id: language
      label: Language
      required: true
    - id: testing
      label: Testing
      allowNone: true
```

Slot order defines prompt order. `required: true` means the CLI cannot offer `None`. `allowNone: true` means the CLI appends a generic `None` option; `None` is a UI sentinel and is never registered as a stack component.

A slot must not set both `required: true` and `allowNone: true`.

### Stack Component Metadata

A stack-component manifest declares the slot it belongs to:

```yaml
schemaVersion: 1
id: vite
kind: stack-component
version: 8.0.0
displayName: Vite
compatibility:
  projectTypes: [web, monorepo]
stack:
  slot: frontend-framework
  compatibleWith:
    frontend-library: [react]
```

`compatibleWith` is optional. It maps another slot ID to allowed component IDs for that slot. The stack resolver validates all declared constraints present in the final composition.

Existing top-level `dependencies` are reused for required extension dependencies. If a stack component depends on another stack component, the resolver looks up that dependency, determines its declared slot, and auto-selects it if the slot is empty.

Example future manifest:

```yaml
id: nextjs
kind: stack-component
version: 16.0.0
displayName: Next.js
stack:
  slot: frontend-framework
  compatibleWith:
    frontend-library: [react]
dependencies:
  - react
```

If the user chooses Next.js, React is automatically selected in `frontend-library` and the preview records `required by Next.js`.

## Stack Resolver

Create a dedicated stack resolver under Core.

### Responsibilities

`StackResolver` must:

- load the selected project type and its ordered slot definitions;
- list candidate stack components for a slot;
- filter components by `compatibility.projectTypes`;
- filter candidates against already selected components' `compatibleWith` rules;
- accept explicit user selections;
- accept omitted optional slots;
- recursively resolve stack-component dependencies;
- reject dependency cycles;
- reject conflicting automatic and explicit selections;
- validate final pairwise compatibility;
- return final stack references in canonical `id@version` format;
- return provenance for every selected slot.

### Core Types

```ts
export interface StackSlotDefinition {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly allowNone?: boolean;
}

export interface StackSelection {
  readonly slot: string;
  readonly componentId?: string;
}

export interface ResolvedStackEntry {
  readonly slot: string;
  readonly id: string;
  readonly version: string;
  readonly source: "user" | "auto";
  readonly reason?: string;
}

export interface StackResolution {
  readonly stack: Readonly<Record<string, string>>;
  readonly entries: readonly ResolvedStackEntry[];
}
```

The stack map uses slot IDs as keys and canonical `id@version` references as values.

## CLI Custom Wizard

The CLI asks for Setup first as today. When the user chooses `Custom`:

1. Load the selected project type's `stack.slots`.
2. Iterate slots in manifest order.
3. Ask the stack resolver for currently valid choices for that slot.
4. If the resolver has already auto-selected the slot through dependencies, skip the prompt.
5. If `allowNone` is true, append `None` to the displayed choices.
6. Send each explicit selection back to the stack resolver.
7. After stack slots, ask compatible Authentication capability choices.
8. Ask Agents mode: Automatic, Custom, None.
9. Build the final create plan from the resolved stack/capabilities/agent mode.
10. Render the final composition summary.
11. Ask for installation/continue confirmation before writing files.

The CLI must never derive slot membership from component IDs or display names.

## Authentication

Authentication remains capability-driven, separate from stack slots.

The Custom flow lists `auth-*` capabilities compatible with the selected project type and appends generic `None`. Selecting None means no authentication capability is requested.

No provider-specific authentication IDs are hardcoded into the CLI.

## Agents

The Custom flow offers the generic modes:

```text
Automatic
Custom
None
```

For this feature, `Automatic` continues to use the existing `agentMode: "automatic"` behavior and `None` uses `agentMode: "none"`.

`Custom` is presented only if the current configuration has a supported custom-agent selection path. If that path is not yet implemented when this feature lands, `Custom` must not be shown rather than exposing a non-functional option. The later Agent Resolver work can enable it without changing the Custom Stack Wizard contract.

## Preview

Create a composition preview model independent from terminal colors.

Every resolved stack entry displays:

- slot label from project-type manifest;
- stack component display name from Registry;
- optional `(auto: <reason>)` suffix for resolver-selected dependencies.

Authentication displays the capability manifest's display name.
Agents displays the chosen generic mode.

The preview is rendered for both Recommended and Custom compositions using resolved data rather than tech-specific formatting rules.

## Recommended Flow Compatibility

Recommended presets continue to work unchanged. Preset `selection.stack` keys should correspond to project-type slot IDs, but the preset remains the source of its recommended selection.

Recommended composition still goes through normal create resolution and final preview. This feature does not require users to answer every stack slot when choosing Recommended.

## Validation and Errors

The resolver returns/throws a configuration error when:

- a project type references an invalid or duplicate slot;
- a required slot has no selected or auto-resolved component;
- a component is assigned to a different slot than requested;
- a component is incompatible with the project type;
- two selected components violate `compatibleWith`;
- a required dependency conflicts with a user-selected component in the same slot;
- stack-component dependencies form a cycle.

The CLI presents concise errors and must never silently replace an explicit user choice.

## Initial Registry Data

Update the current built-in Monorepo-compatible stack components with slot metadata:

- `pnpm-workspaces` → `workspace`
- `vite` → `frontend-framework`
- `react` → `frontend-library`
- `express` → `backend-framework`
- `typescript` → `language`
- `vitest` → `testing`

Add `compatibility.projectTypes` appropriate to the existing project types.

Do not create placeholder manifests for unsupported frameworks. A choice appears only when it has a real registered implementation.

## Testing Strategy

Use TDD for each layer.

1. Manifest schema tests for valid project slots and stack-component metadata.
2. Registry tests proving built-in components expose the correct slots.
3. Stack resolver tests for candidate filtering, None/optional behavior, dependency auto-resolution, compatibility rejection, conflict rejection, and cycle rejection.
4. Create resolver tests proving resolved custom stack reaches `RepoConfigSchema` unchanged.
5. CLI tests proving Custom Monorepo prompts in manifest order and does not hardcode unsupported options.
6. Preview tests proving auto-resolved entries and reasons are visible.
7. Regression tests for Recommended and non-interactive create flows.
8. Full `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` verification.

## Non-Goals

- Implementing Next.js, Vue, Svelte, NestJS, Fastify, Jest, npm, or yarn generators in this change.
- Implementing a marketplace or remote extension source.
- Replacing the existing capability resolver.
- Completing the separate Agent Resolver refactor.
- Changing executor/generator architecture beyond what is necessary to consume the resolved custom stack.

## Acceptance Criteria

- `Custom` Monorepo no longer shows only Authentication.
- Stack prompts are generated from Registry metadata and project-type slot definitions.
- CLI contains no tech-specific branch logic for Custom stack choices.
- Only supported registered stack components are shown.
- Dependencies can auto-select stack components.
- Every auto-selected component appears in the final summary with a reason.
- Explicit user selections are never silently overwritten.
- Authentication remains capability-driven and supports None.
- Agents supports at least Automatic and None; unsupported Custom mode is not exposed.
- Recommended flow remains functional.
- Non-interactive create behavior remains functional.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass.
