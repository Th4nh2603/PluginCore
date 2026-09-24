# Unified `repo create` wizard

## Intent and scope

The interactive Monorepo wizard should follow the approved [mock](../../ux/cli-wizard-mock.html): a preset is a starting configuration that can be edited one component at a time. A user can start from Recommended Monorepo, change only Authentication or another stack choice, review the resulting configuration, and install without restarting in a separate Custom branch. The mock is a browser representation of the terminal flow; the CLI keeps its existing arrow-key menus.

This change applies to interactive `repo create` for `monorepo`. Web, API, and Empty retain their current behavior. Scripted commands and flags keep their existing meaning, including `--type`, `--preset`, `--auth`, `--target`, `--registry`, and `--yes`.

## Flow

1. Ask for repository name and project type as today, unless flags supplied them.
2. For Monorepo, show `Start from` with `Recommended Monorepo` and `Custom`. Recommended starts with React, Express, Prisma, and Custom Authentication. Custom starts with these four fields unset. `--preset` skips this selection and pre-fills from that preset. An explicit `--auth` value stays authoritative, so Authentication is displayed but not edited in the interactive menu.
3. Show one `Configure stack` menu with Frontend, Backend, ORM, and Authentication rows displaying their current values, plus `Continue`. Selecting a row opens its available options. After choosing a value, return to the same menu so another row can be edited. Fixed Monorepo components (pnpm workspace, Vite, TypeScript, PostgreSQL, Vitest) are visible as informational text and are not selectable. `Continue` requires all four editable values. The menu works with ↑/↓ and Enter through `@inquirer/select`; no single-choice submenu is shown for a category with only one available value.
4. Show `Review` with name, project type, starting point, all editable and fixed stack choices, target path, and whether the preset was changed. The final menu offers `Install`, `Edit stack`, and `Cancel`. `Edit stack` returns to the existing selections. No files are written before `Install`.

The mock's `Install` button is deliberately nonfunctional; the real CLI applies the already reviewed create plan after `Install`.

## Data and behavior

Build available options from the registry, respecting project-type compatibility. The default Recommended Monorepo preset supplies its stack and authentication capability; if an alternative Monorepo preset is supplied by `--preset`, pre-fill from that preset. Preserve the selected preset ID in `repo.config.yaml` and pass edited stack components as overrides to `planCreate`. Pass the final Authentication choice separately so it replaces the preset authentication capability. A Custom start has no preset ID.

The editor stores component IDs and versioned references, not display labels. Resolve labels only for menus and review. Selecting the currently shown value leaves the configuration unchanged. Changed status compares final choices with the chosen preset's initial choices. A configured registry with no compatible Monorepo preset shows only Custom; missing editable categories follow the registry's available options, and a one-option category is displayed as its value without a redundant selection menu.

Invalid names, unavailable preset/authentication/stack values, incomplete Custom choices, and cancelled installation must not create files. Errors continue to use the CLI's existing exit codes and create-service validation. Noninteractive creation remains driven by arguments and `--yes`; it does not enter the new editor.

## Implementation boundaries

Keep orchestration in `src/cli/main.ts`, move Monorepo editor state and registry-option construction into a focused CLI module, and add review formatting in `src/cli/presentation.ts`. Reuse `CliPrompt.select` so the existing interactive terminal and injected test prompts have the same behavior. Do not alter the resolver or generator unless a test shows an actual incompatibility with preset overrides.

Replace the old Monorepo Recommended/Custom branch tests with behavior tests for preset editing, Custom completion, `Edit stack`, `Cancel`, invalid choices, and flags. Keep coverage for Web/API/Empty and noninteractive flows. Run the CLI test suite, full test suite, typecheck, lint, and build. Manually exercise the linked `repo create` terminal flow in a disposable directory without committing generated projects.
