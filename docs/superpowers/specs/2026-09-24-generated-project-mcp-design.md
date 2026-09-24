# MCP capability for generated projects

## Status and intent

Design approved in conversation on 2026-09-24. PluginCore-generated API and Monorepo projects may include a local MCP server so an AI host can call application functions. The server belongs to the generated project, not to the `repo` CLI. The first generated tool is a working `get_health` example; project owners add later business tools beside it.

## Scope and user experience

- Add an optional `mcp-server` capability compatible with `api` and `monorepo`. It is off by default, including in Recommended presets. `web` and `empty` cannot select it.
- Interactive create shows `MCP: Off/On` as an editable choice. The Monorepo editor keeps the selected value when returning from Review; the API flow shows the choice before its final install review. Review and preview display the resolved MCP choice.
- Noninteractive create accepts `--capability mcp-server`; an unknown or incompatible capability fails before the target is created. Existing commands without this flag generate the same project structure as before.
- Preset capability selections and explicit optional capabilities are combined by ID, preserving a preset's authentication choice. An explicit authentication choice replaces only the `auth-*` capability. The resolved list in `repo.config.yaml` records `mcp-server` and its version when enabled.
- The generated README explains `pnpm build`, `pnpm mcp`, and how to register the local command in an MCP host. It includes a concrete Codex `config.toml` example and shows where to add a tool that calls an application service.

## Approach

Use a separate stdio process co-located with the generated backend. For an API project, place it under `src/mcp/`; for a Monorepo, place it under `apps/api/src/mcp/`. The process runs independently of the HTTP server and shares a small application function with the `/health` route. It does not bind a network port or proxy HTTP requests. Use the stable MCP TypeScript SDK v2 server package, its `serveStdio` entry, and Zod schemas for tool inputs.

This is preferable to a separate `apps/mcp` workspace, which would need a cross-workspace service contract, and to embedding a remote MCP endpoint in the HTTP API, which would add transport and authentication design to the first release.

The generated backend package receives the MCP SDK dependency and an `mcp` script for its built entry point. A Monorepo root script delegates to the API workspace so users can run `pnpm mcp` from the project root. MCP protocol messages use stdout exclusively; diagnostics go to stderr. The initial `get_health` tool calls a shared `getHealth()` function that also backs `GET /health`, proving the extension path without exposing authentication or database operations. The generated MCP file contains a clear tool-registration section for later business functions.

The generated README contains this Codex connection example, with an instruction to replace the working directory with the generated project's absolute path and run `pnpm build` first:

```toml
[mcp_servers.project_app]
command = "pnpm"
args = ["mcp"]
cwd = "/absolute/path/to/generated-project"
```

The example is documentation, not an automatically activated host setting. Codex supports both user-level and trusted project-scoped `config.toml`; users can place the snippet in either location. The generated `AGENTS.md` tells backend and reviewer roles that `get_health` can check the application contract once the host connection is active. Role files remain work instructions, not MCP client processes or tool-access controls.

## PluginCore boundaries and data flow

1. Registry: add `registry/capabilities/mcp-server/manifest.yaml` with API/Monorepo compatibility. The capability resolver checks its identity, version, and compatibility like other capabilities.
2. CLI: collect the optional MCP selection independently of stack and authentication. Preserve it through Monorepo Edit stack and Review, and pass it into `planCreate`. Use the same resolved choice for interactive and flag-driven creation.
3. Application/core: merge preset capabilities with explicit optional capabilities by ID. Apply an explicit authentication override only to the authentication family. Keep the generic planner and `RepoConfig` shape; no MCP-specific field is added to core configuration.
4. Execution: after the project-type and authentication generators have produced the backend, an MCP capability generator adds its files and updates backend package metadata. It must work for the supported legacy Monorepo and custom API/Monorepo generation paths, including Express/Fastify and both current authentication choices. Generated-file verification and rollback remain under the existing create executor.
5. Generated project: `pnpm build` compiles the API and MCP entry point. `pnpm mcp` starts the stdio server. An MCP host can list and call `get_health` and receive the same status payload as HTTP `GET /health` without starting the HTTP server.

The MCP generator should compose structured package JSON and generated source contracts. It must not rely on arbitrary shell text from a registry manifest or brittle search-and-replace of unrelated source files. File ownership remains with the created project after generation.

## Errors and safety

- Reject unsupported project types, missing capability manifests, missing backend output, and package/source conflicts before reporting create success.
- A failure during MCP generation or dependency installation triggers the existing create rollback; a pre-existing target remains untouched.
- The generated example exposes read-only health data. No authentication token, database query, arbitrary filesystem access, or shell execution is offered as a tool. Additional tools are project-owned code and require their own access-control decisions.
- Stdio remains local to the launching host. A remotely accessible MCP transport is outside this release.

## Verification and acceptance

1. Resolver tests show that opting into MCP preserves the preset authentication capability, and that explicit authentication changes only the auth capability. Invalid selections fail before creation.
2. CLI tests cover MCP Off/On, Monorepo review/edit persistence, API selection, and `--capability mcp-server`.
3. Generate API and Monorepo fixtures with MCP enabled and disabled across representative custom/legacy stacks and authentication choices. Verify expected files, package scripts/dependencies, and `repo.config.yaml`.
4. For at least one generated API and one generated Monorepo project, install dependencies, build, launch the MCP process through a test client, list tools, call `get_health`, and compare its result with the shared health function. Verify stdout carries only protocol messages. Check that the README's Codex example names the working `pnpm mcp` command and that Monorepo agent guidance mentions the tool.
5. Run PluginCore tests, typecheck, lint, and build. A failed MCP generator test confirms rollback removes only the target created by that run.

Success means a user can select MCP while creating an API or Monorepo project, build it, register its local command with an MCP host, and immediately call `get_health`; projects created without the selection retain their current behavior.
