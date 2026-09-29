# Tool & MCP catalog and `repo create` selector — design

## Status

Design proposal. This document and its [interactive UI mock](../../ux/tool-mcp-selector-mock.html) describe desired behavior; they do not claim that `repo create` already supports MCP. The design extends the Phase 1 architecture and the existing unified create wizard. No MCP connection or external tool is started while creating a repository.

## Goal

A developer creating any supported repository can review a curated catalog of host-native tools and MCP servers, select zero or more optional entries, review required permissions and configuration, and save the intended setup for the chosen AI host. An unselected tool must not be installed, connected, or granted access. Existing create commands and projects without MCP remain valid.

## Concepts and ownership

- **Native tool:** an operation exposed by the selected AI host (for example read files, edit files, execute tests, Git status). PluginCore can declare desired access, but cannot promise that a given host supports or enforces every permission.
- **MCP server:** a connection to a server that advertises tools, resources, or prompts. Selecting a server is not blanket approval to invoke every advertised tool.
- **Tool catalog:** human-readable, versioned metadata for discoverability and permission review; tool implementation remains with its host or MCP server.
- **MCP adapter:** translates a validated project-local selection into host-specific configuration. PluginCore must not silently modify user-global configuration or silently start a server. Unsupported hosts/configurations fail with actionable diagnostics or are clearly marked as config-only.

The CLI and application layers only assemble a selection. Registry schemas validate catalog manifests, a resolver validates compatibility and explicit per-agent tool policies, the planner proposes generated files, and a host adapter renders them. No technology- or server-name-specific branch belongs in the generic resolver.

## Initial catalog (illustrative, not preapproved integrations)

| Kind | ID | Display | Initial default | Important access |
| --- | --- | --- | --- | --- |
| native-tool | `filesystem-read` | Read project files | Host default | Project read boundary |
| native-tool | `filesystem-edit` | Edit project files | Host default | Project write boundary |
| native-tool | `terminal-test` | Run project checks | Host default | Process execution |
| native-tool | `git-local` | Inspect local Git | Host default | Project history; write actions separately approved |
| mcp-server | `github` | GitHub MCP | Off | Repository scopes, OAuth/token reference |
| mcp-server | `playwright` | Browser automation MCP | Off | Browser/session access |
| mcp-server | `postgres-readonly` | PostgreSQL MCP (read-only profile) | Off | Database connection, SELECT-only enforcement |
| mcp-server | `design` | Design MCP (provider-configured) | Off | Design project access and provider authentication |
| mcp-server | `custom` | Custom MCP server | Off | Explicit transport, executable/URL, trust review |

Registry entries must specify `kind`, ID, version, description, compatible hosts/project types, transport, setup requirements, permission/risk metadata, and an implementation/host-adapter reference when supported. Do not ship invented or unverified executable commands, packages, official-provider claims, or credential values in the catalog. The custom entry is an authoring flow, not a directly executable sample.

## `repo create` interaction

The current project type -> preset/custom -> stack selection remains intact. Add a separate **Tools & MCP** step after the stack is resolved but before the final Review/Install decision for all supported project types. The mock shows a terminal-inspired visual model; the real CLI uses its existing keyboard-first select prompt and test-injectable `CliPrompt` interface.

1. Prompt **Configure tools & MCP?** with `Recommended`, `Custom`, and `None`. Recommended shows native host defaults and leaves all external MCP connections off. None emits no additional tool/MCP configuration.
2. Custom opens two independent groups: **Native tools** and **MCP servers**. Each item shows display name, what it can access, whether it needs authentication, host compatibility, and an enabled checkbox. Multi-select may be implemented with `@inquirer/checkbox` or a toggle loop that remains injectable in CLI tests.
3. Allow **Select / deselect**, **Back**, **Continue** and **Skip MCP** without losing stack selections. After choosing a server, show its required non-secret parameters, requested permission scope, and whether a host adapter is available; do not request or persist plaintext credentials.
4. Review summarizes stack, agents, selected native tools, selected MCP servers, host adapter, permissions, required setup, target, and every file to be generated. Provide **Edit tools & MCP**, **Edit stack**, **Install**, and **Cancel**. No files are written until Install.
5. For non-interactive create, add explicit repeatable/CSV-compatible `--mcp <id>` and `--tool <id>` support (the exact parser convention must be documented and tested). Unspecified options keep MCP disabled. Invalid IDs and incompatible hosts fail before target creation; there is no auto-enable based on guesswork.

## Configuration and compatibility

Extend the `repo.config.yaml` schema **additively** with optional tool/MCP selections using stable catalog references. Store enabled server IDs, connection config references, and per-agent allowlists; do not copy discovered tool lists into the canonical project config. Keep existing schema-version-1 project files readable; an eventual breaking change requires an explicit schema migration. The resolver checks referenced entries, duplicate IDs, selected agent/host compatibility, and disabled-server references before planning. A preset may suggest but not activate an external MCP connection without a separate user confirmation.

When an MCP server requires a token, the generated configuration must reference environment variables or the host's secure credential mechanism. Prefer documented, verified host-specific configuration formats and place files within the generated project. Provide a helpful post-create checklist rather than claiming an authenticated connection is active. A requested read-only profile is meaningful only if enforced by the chosen server/database account, never by a UI label alone.

## Security and failure behavior

Use least privilege. Tool-call approval and audit are host-runtime responsibilities unless PluginCore later implements its own agent runtime. Untrusted MCP servers and remote content may produce prompt-injection instructions; treat tool results as data, not authority to change policy. Never execute arbitrary manifest shell hooks. Render and validate paths under the target repository, preserve user-owned/global configs, and include generated files in create verification and managed state when the persisted state contract supports it. The existing transactional create rollback must apply to failed host-config generation.

If a host cannot support a selected MCP server or permission restriction, block Install with an explanatory message or label the selection config-only and omit runnable output. Do not silently broaden permissions.

## Test and acceptance contract

- Catalog schema rejects unknown kinds/invalid IDs, duplicate entries, missing adapters, or unsupported transport declarations.
- UI tests cover Recommended, Custom multi-select/toggle, None, Back/Edit, skipped MCP, invalid choice, and Cancel; old Web/API/Monorepo flows remain unchanged when no tools are selected.
- Resolver tests cover invalid IDs, version mismatch, incompatible project/host, duplicate selections, disabled servers, and per-agent authorization.
- Snapshot/integration tests verify host-specific generated config with no plaintext secrets, zero MCP output when none selected, and a review matching the config written.
- Create verification/rollback tests cover partial config output and denied/invalid server configuration.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` must pass before the feature is represented as implemented.

## Delivery stages

1. Approve this design and mock; settle supported AI hosts and trusted MCP manifests.
2. Introduce catalog schemas, registry validation, additive repository config, and resolver tests.
3. Implement injectable CLI selector, review/editor integration, non-interactive flags, and tests.
4. Implement a verified host adapter and generated project-local config, then end-to-end create/rollback tests.
5. Update README and `docs/cli-create-wizard.md` to describe **implemented** behavior only.
