# Generated Project MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt into a working local MCP server when PluginCore creates an API or Monorepo project, with a testable `get_health` tool and detailed connection documentation.

**Architecture:** Treat `mcp-server` as a registry capability. The resolver combines it with preset authentication; the CLI exposes an Off/On choice; project generation writes a separate stdio server beside the API and shares `getHealth()` with the HTTP route. A Codex config example documents how an agent host launches the generated process.

**Tech Stack:** TypeScript, Node.js >=20, pnpm 10, Vitest, Zod 4, MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.1.0; `@modelcontextprotocol/client` 2.1.0 for integration tests).

**Spec:** `docs/superpowers/specs/2026-09-24-generated-project-mcp-design.md`

## Global Constraints

- MCP is optional and off by default; only `api` and `monorepo` can select it.
- Keep `web` and `empty` output unchanged. Preserve preset authentication when MCP is selected.
- Generated server uses stdio only; stdout carries protocol messages, stderr carries diagnostics.
- Initial tool is read-only `get_health`; it must use the same function as HTTP `GET /health` without starting the HTTP server.
- Existing create verification and rollback own all newly generated files. No arbitrary commands from manifests.
- The generated README includes a Codex `config.toml` example with an absolute `cwd` placeholder; do not edit the user's Codex configuration automatically.

## Review Focus

1. `--capability mcp-server` with Recommended Monorepo must keep exactly one auth capability; pin this in Task 1 resolver tests and Task 2 CLI tests.
2. `--capability mcp-server` on `web` or `empty` must fail without creating a target; pin this in Task 1 plan tests and Task 2 CLI tests.
3. A custom Fastify API must compile its MCP server and keep `/health` consistent; pin this in Task 3 generator tests and Task 5 integration tests.
4. A legacy Clerk Monorepo must retain auth files while adding MCP; pin this in Task 3 output tests and Task 5 build tests.
5. MCP generation failure must roll back only a newly owned target; pin this in Task 4 application tests. An MCP response must contain no log noise; pin this in Task 5 client tests.

---

## File map

- `registry/capabilities/mcp-server/manifest.yaml`: capability metadata and compatibility.
- `src/core/resolver/create-resolver.ts`: merge preset and explicit capability selections.
- `src/cli/monorepo-wizard.ts`, `src/cli/main.ts`, `src/cli/presentation.ts`: opt-in selection, flag handling, review text.
- `src/execution/capabilities/mcp-selection.ts`: shared `hasMcpCapability(config)` predicate for generators.
- `src/execution/templates/backend.ts`, `src/execution/capabilities/auth-custom*.ts`, `src/execution/capabilities/auth-clerk*.ts`, `src/execution/custom-stack-generator.ts`: conditional shared health contract in all supported backend variants.
- `src/execution/capabilities/mcp-server.ts`: generate MCP entry point, package changes, README/agent guidance; no core-specific generator branches.
- `src/application/create-service.ts`: dispatch selected MCP capability to its generator.
- `docs/mcp-generated-projects.md`, `README.md`, `docs/cli-create-wizard.md`: detailed user instructions.
- Focused tests under `tests/core`, `tests/cli`, `tests/execution`, `tests/application`, and `tests/integration`.

### Task 1: Registry and capability resolution

**Files:** Create `registry/capabilities/mcp-server/manifest.yaml`; modify `src/core/resolver/create-resolver.ts`; test `tests/core/resolver/create-resolver-capabilities.test.ts` and `tests/application/create-service-resolution.test.ts`.

**Interfaces:** Consume `CreateResolutionInput.capabilities: readonly {id:string; version:string; configRef?:string}[]`; produce `config.composition.capabilities` and ordered `selected` operations with authentication before MCP. `mcp-server` has version `1.0.0` and compatibility `[api, monorepo]`.

Manifest to create:

```yaml
schemaVersion: 1
id: mcp-server
kind: capability
version: 1.0.0
displayName: Local MCP Server
description: Expose generated application functions to local AI hosts over stdio.
compatibility: { projectTypes: [api, monorepo] }
```

The key regression assertion is:

```ts
expect(resolution.config.composition.capabilities?.map(({ id }) => id))
  .toEqual(["auth-custom", "mcp-server"]);
```

- [ ] **Step 1: Write failing tests.** Add a fixture manifest `{id:"mcp-server", kind:"capability", version:"1.0.0", compatibility:{projectTypes:["api","monorepo"]}}`. Assert `resolveCreateComposition({...baseInput(registry), preset:"recommended-monorepo", capabilities:[{id:"mcp-server",version:"1.0.0"}]})` resolves `["auth-custom","mcp-server"]`; with `authentication:"clerk"` it resolves `["auth-clerk","mcp-server"]`. Assert repeated MCP IDs resolve once. In `create-service-resolution.test.ts`, call `planCreate` for `web` with MCP and assert rejection plus `existsSync(targetDirectory) === false`.
- [ ] **Step 2: Confirm red.** Run `pnpm vitest run tests/core/resolver/create-resolver-capabilities.test.ts tests/application/create-service-resolution.test.ts`; expect the merge/compatibility tests to fail because explicit capabilities currently replace preset capabilities.
- [ ] **Step 3: Implement the merge.** Add the manifest. In `resolveCreateComposition`, use the following sequence so preset auth executes before MCP:

```ts
const chosen = new Map<string, string | CapabilitySelection>();
for (const id of preset?.selection?.capabilities ?? projectType.selection?.capabilities ?? []) chosen.set(id, id);
for (const item of input.capabilities) chosen.set(item.id, item);
if (input.authentication !== undefined) {
  for (const id of chosen.keys()) if (id.startsWith("auth-")) chosen.delete(id);
  chosen.set(`auth-${input.authentication}`, `auth-${input.authentication}`);
}
const requestedCapabilities = [...chosen.values()];
```

Reject an explicit requested version that differs from the registry manifest version in `resolveCapabilities`; assert that mismatch in the focused tests.
- [ ] **Step 4: Confirm green.** Run the same focused tests and `pnpm typecheck`.
- [ ] **Step 5: Commit.** Stage only the manifest, resolver, and tests; commit `feat: resolve optional MCP capability with presets`.

### Task 2: CLI selection and review

**Files:** Modify `src/cli/main.ts`, `src/cli/monorepo-wizard.ts`, `src/cli/presentation.ts`; test `tests/cli/monorepo-wizard.test.ts`, `tests/cli/recommended-wizard.test.ts`, `tests/cli/main.test.ts`, `tests/cli/presentation.test.ts`.

**Interfaces:** Add `MonorepoSelection.mcpEnabled: boolean` and `MonorepoEditorInput.mcpEnabled?: boolean`; CLI passes `[{id:"mcp-server",version:"1.0.0"}]` only when enabled. `MonorepoReview.mcpEnabled: boolean` formats `MCP: On|Off`.

```ts
interface MonorepoSelection {
  readonly mcpEnabled: boolean;
  // Keep the existing preset, stack, authentication, startingPoint, and changed fields.
}
const mcpChoices = [
  { name: "Off", value: "off" },
  { name: "On", value: "on" }
] as const;
```

- [ ] **Step 1: Write failing tests.** In `monorepo-wizard.test.ts`, select `edit:mcp`, choose `on`, return from Review via `previous`, and assert `mcpEnabled === true`; assert continuing without editing gives false. In `recommended-wizard.test.ts`, make `Review` inspect `MCP: On` and assert `repo.config.yaml` contains both `auth-custom` and `mcp-server`. In `main.test.ts`, test API interactive `confirm("Include MCP server?") === true`, scripted `--capability mcp-server --yes`, and rejection for `--capability mcp-server --type web` with no target. In `presentation.test.ts`, assert review displays MCP state.
- [ ] **Step 2: Confirm red.** Run `pnpm vitest run tests/cli/monorepo-wizard.test.ts tests/cli/recommended-wizard.test.ts tests/cli/main.test.ts tests/cli/presentation.test.ts`.
- [ ] **Step 3: Implement Monorepo choice.** Add a `MCP: Off/On` row to `Configure stack`; `edit:mcp` shows Off/On choices; preserve the value from `input.previous`, and treat an explicit `--capability mcp-server` as fixed On. Pass the selected capability to every `planCreate` call, including Edit stack and Custom continuation. Extend `formatMonorepoReview` with `MCP: On|Off`.
- [ ] **Step 4: Implement API and flags.** Parse `--capability` from the existing argument map; only accept `mcp-server`, validate its registry manifest and project-type compatibility before planning, and keep it On for scripted creation. For interactive API creation without the flag, ask `confirm("Include MCP server?")` after stack/preset choice and before plan/review; default remains false. Show `MCP: On|Off` in preset and custom preview. Document the flag in `helpText()`. Do not prompt for MCP on `web` or `empty`.
- [ ] **Step 5: Confirm green.** Run the focused CLI tests, `pnpm typecheck`, and `pnpm lint`.
- [ ] **Step 6: Commit.** Stage only CLI files and their tests; commit `feat: select MCP during repository creation`.

### Task 3: Shared health contract in generated backends

**Files:** Create `src/execution/capabilities/mcp-selection.ts`; modify `src/execution/templates/backend.ts`, `src/execution/custom-stack-generator.ts`, `src/execution/capabilities/authentication.ts`, `src/execution/capabilities/auth-custom.ts`, `src/execution/capabilities/auth-clerk.ts`, `src/execution/legacy-create-generator.ts`; test `tests/execution/mcp-health-generation.test.ts`.

**Interfaces:** Export `hasMcpCapability(config: RepoConfig): boolean`. When true, each generated backend has `src/health.ts` exporting `getHealth(): {status:"ok"}` and its HTTP `/health` handler calls that function. When false, existing output stays byte-for-byte compatible where practical.

```ts
export const hasMcpCapability = (config: RepoConfig): boolean =>
  config.composition.capabilities?.some(({ id }) => id === "mcp-server") ?? false;
```

Generated conditional service and route:

```ts
// src/health.ts, only when MCP is selected
export const getHealth = () => ({ status: "ok" as const });
// Express: app.get("/health", (_request, response) => response.json(getHealth()));
// Fastify: app.get("/health", async () => getHealth());
```

- [ ] **Step 1: Write failing generation tests.** Generate a custom Fastify API with MCP and assert `src/health.ts` exists and `src/app.ts` imports `getHealth`; generate legacy Custom and Clerk Monorepos with MCP and assert `apps/api/src/server.ts` imports it while auth routes remain. Generate one API without MCP and assert `src/health.ts` is absent. Use a stub `GeneratorRunner` so tests do not install dependencies.
- [ ] **Step 2: Confirm red.** Run `pnpm vitest run tests/execution/mcp-health-generation.test.ts`.
- [ ] **Step 3: Implement conditional output.** `hasMcpCapability` checks `config.composition.capabilities?.some(item => item.id === "mcp-server")`. Extend `backendFiles` with a final `mcpEnabled = false` parameter; when true, add `src/health.ts` containing `export const getHealth = () => ({ status: "ok" as const });` and make Express/Fastify health routes import/call it. Thread the boolean through `generateCustomStack`, `AuthenticationExecutor.backendFiles`, and `applyCustomAuthentication`. Extend `AuthenticationExecutor.generateLegacy` and both legacy auth scaffold writers with the same boolean; they emit `apps/api/src/health.ts` and call it in `src/server.ts`. Keep the old route text when false.
- [ ] **Step 4: Confirm green.** Run the focused tests plus `pnpm vitest run tests/execution/authentication-capability.test.ts tests/application/create-service.test.ts`, then `pnpm typecheck`.
- [ ] **Step 5: Commit.** Stage only generator/health files and tests; commit `feat: share generated health service with MCP`.

### Task 4: MCP server capability generator

**Files:** Create `src/execution/capabilities/mcp-server.ts`; modify `src/application/create-service.ts`; test `tests/execution/mcp-server-capability.test.ts`, `tests/application/create-service.test.ts`.

**Interfaces:** Export `generateMcpCapability(targetDirectory: string, config: RepoConfig, runner: GeneratorRunner): Promise<GenerationResult>`. It expects Task 3's generated backend/health files and writes `src/mcp/server.ts` beneath that backend. It adds `@modelcontextprotocol/server: "^2.1.0"`, `zod: "^4.6.5"`, backend `scripts.mcp = "node dist/mcp/server.js"`, and Monorepo root `scripts.mcp = "pnpm --filter ./apps/api mcp"`.

Generated entry point content:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";
import { getHealth } from "../health.js";

serveStdio(() => {
  const server = new McpServer({ name: "project-app", version: "1.0.0" });
  server.registerTool("get_health", {
    description: "Read application health status",
    inputSchema: z.object({})
  }, async () => ({ content: [{ type: "text", text: JSON.stringify(getHealth()) }] }));
  return server;
});
```

- [ ] **Step 1: Write failing tests.** In `mcp-server-capability.test.ts`, create temporary backend package JSON/health files, call `generateMcpCapability`, and assert server source registers `get_health` through `serveStdio`, package JSON contains exact dependency/script keys, README has the Codex TOML block and `pnpm build` instruction, and Monorepo `AGENTS.md` names `get_health` for backend/reviewer. Assert missing backend package or health file throws without inventing them. In `create-service.test.ts`, make the stub runner throw on MCP's final `pnpm install`; assert target rollback and that a separately pre-existing target remains untouched.
- [ ] **Step 2: Confirm red.** Run `pnpm vitest run tests/execution/mcp-server-capability.test.ts tests/application/create-service.test.ts`.
- [ ] **Step 3: Implement generator.** Validate `mcp-server` is selected and `config.project.type` is `api|monorepo`; choose backend root accordingly. Require backend `package.json` and `src/health.ts` to exist. Parse backend and root package JSON as objects, reject non-object values and conflicting `mcp` script/dependency values, and write the updated JSON in the existing generator style. Generate the entry point above. Append a generated-project README section with the exact Codex example from the spec. Update Monorepo `AGENTS.md` and backend/reviewer role instructions without replacing existing guidance. Run `pnpm install` in the project root after updating package metadata, then return generated file paths.
- [ ] **Step 4: Wire dispatch.** In `applyCreatePlan`, add an exact `operation.extension.id === "mcp-server"` capability branch calling `generateMcpCapability`; unknown capabilities still return no generated files. Ensure resolver ordering makes auth generation happen before MCP package edits.
- [ ] **Step 5: Confirm green.** Run the focused tests, `pnpm typecheck`, and `pnpm lint`.
- [ ] **Step 6: Commit.** Stage only MCP generator, application dispatch, and tests; commit `feat: generate project-local MCP server`.

### Task 5: Real connection test and detailed MCP documentation

**Files:** Create `tests/integration/generated-mcp.test.ts` and `docs/mcp-generated-projects.md`; modify `README.md`, `docs/cli-create-wizard.md`, and PluginCore devDependencies/lockfile for `@modelcontextprotocol/client` 2.1.0.

**Interfaces:** Use the official `Client` and `StdioClientTransport` from `@modelcontextprotocol/client`. Test calls the generated `pnpm mcp` process after `pnpm build`; documentation covers API/Monorepo creation, tool list, Codex connection, agent relationship, extending tools, and troubleshooting.

The connection assertion uses this client shape:

```ts
const client = new Client({ name: "plugin-core-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  args: ["mcp"],
  cwd: targetDirectory
});
await client.connect(transport);
try {
  expect((await client.listTools()).tools.map(({ name }) => name)).toContain("get_health");
  const result = await client.callTool({ name: "get_health", arguments: {} });
  expect(result.isError).not.toBe(true);
  expect(result.content).toContainEqual({ type: "text", text: '{"status":"ok"}' });
} finally {
  await client.close();
}
```

- [ ] **Step 1: Write failing end-to-end test.** In `tests/integration/generated-mcp.test.ts`, create one recommended API and one recommended Monorepo with MCP via `planCreate`/`applyCreatePlan` using the real runner in temporary roots; run `pnpm build`; connect `new Client({name:"plugin-core-test",version:"1.0.0"})` through `new StdioClientTransport({command:process.platform === "win32" ? "pnpm.cmd" : "pnpm",args:["mcp"],cwd:targetDirectory})`; assert `listTools()` includes `get_health` and `callTool({name:"get_health",arguments:{}})` returns JSON text with `{status:"ok"}`. Close the client in `finally`; set the integration test timeout to 600000 ms for dependency installation. Add a custom Fastify API and legacy Clerk Monorepo build case, both with real install, to cover the Review Focus.
- [ ] **Step 2: Confirm red.** Add the MCP client dev dependency; run `pnpm vitest run tests/integration/generated-mcp.test.ts` and confirm it fails on absent/incomplete generated output before revising implementation.
- [ ] **Step 3: Verify generated process boundaries.** Confirm `pnpm mcp` invokes `node dist/mcp/server.js` from API or delegates from Monorepo root, `src/mcp/server.ts` imports only `../health.js`, and no generated `console.log` executes in that process. If a focused test exposes a mismatch, fix the responsible generator in Task 3 or 4 and re-run that test before this integration test.
- [ ] **Step 4: Write detailed documentation.** In `docs/mcp-generated-projects.md`, give exact `repo create` examples for interactive and `--capability mcp-server --yes`, generated file tree for API/Monorepo, `pnpm build`, Codex `config.toml` snippet with absolute `cwd`, `codex mcp list`/`/mcp` verification, a sample request for `get_health`, a code example registering a second read-only service tool, and troubleshooting for missing build, wrong cwd, polluted stdout, unavailable `pnpm`, and disabled/untrusted project config. Explain that role TOML files are instructions, while the host runs the MCP client; the initial MCP has no auth/database tool. Link this page from root README and CLI wizard docs.
- [ ] **Step 5: Verify all behavior.** Run `pnpm vitest run tests/integration/generated-mcp.test.ts`, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Run a manual CLI create in a disposable directory and verify `repo.config.yaml` lists `mcp-server@1.0.0`; remove only that disposable directory after inspection.
- [ ] **Step 6: Commit.** Stage only integration tests, documentation, dependency metadata, and any fixes from Step 3; commit `docs: explain and verify generated MCP connection`.

## Final review and handoff

Inspect `git diff --check`, status, and focused test output. Verify the checked-in spec's acceptance points against the generated project artifacts. Report the CLI command the user can run to test MCP, the documentation link, test results, and any environmental limits observed during the real connection test.
