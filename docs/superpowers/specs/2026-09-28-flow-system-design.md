# Phase 6 flow system

## Intent

Give project users a read-only, explainable plan for a task before any agent runs. A flow describes work stages and their required expertise; it does not execute work or mutate the project.

## Contract

`flow` manifests use the existing registry envelope and add `flow.intents`, external `flow.inputs`, and ordered `flow.steps`. A step has a unique ID, input names, an outcome name, expertise tags, optional `verification`/`review` policy gates, and an optional `policy.requiresReview` condition. Every step input must come from an external input or an earlier outcome. Gates are reported in the read-only plan; enforcement belongs to a later execution system. Unknown conditions, gates, malformed project compatibility, duplicate IDs, and missing input producers fail validation. Resolution also rejects an active step whose producer was conditionally skipped. The initial catalog contains feature, bugfix, design, and review flows. Design has no implementation step.

The resolver accepts a registry, project type, task intent/context, configured defaults, optional explicit flow ID, and review policy. It returns the selected flow, its semantic intent, included steps, skipped steps with reasons, and required expertise. Explicit selection wins; if the inferred task intent does not belong to the explicitly chosen flow, its first declared intent becomes the effective intent. Otherwise the resolver selects the first compatible configured flow matching intent. If no configured defaults exist, the compatible registry catalog is used. If no matching flow exists, resolution fails with a clear diagnostic. The existing agent intent classifier supplies the inferred intent.

`repo create` records the compatible initial flow IDs in `flows.defaults`. `repo flows explain` reads project config and prints the selected flow, stages, omissions, and required expertise. `repo agents explain` resolves the same flow and includes its expertise in agent selection; the agent mode still governs optional agents, while required expertise must be covered by compatible agents. For design and review intents, optional agents with source ownership or execution commands are excluded. Review-only agents remain advisory and are never asked to implement.

## Safety and verification

The commands are read-only. Unknown flow IDs, missing expertise coverage, or malformed manifests produce errors. Tests cover selection, explicit override, conditional review, no design implementation, agent integration, CLI output, and generated config. Run lint, typecheck, tests, and build.
