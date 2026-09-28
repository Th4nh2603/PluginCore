import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadRegistry } from "../../../src/core/registry/registry-loader.js";
import { resolveAgents } from "../../../src/core/resolver/agent-resolver.js";
import { renderCodexAgents } from "../../../src/execution/agents/codex-agent-adapter.js";
import { selectAgentAdapter } from "../../../src/execution/agents/adapters.js";

describe("renderCodexAgents", () => {
  it("rejects an adapter without an executor", () => {
    expect(() => selectAgentAdapter("custom-host")).toThrow('No agent adapter executor is available for "custom-host".');
  });
  it("renders only selected roles and keeps Reviewer review-only", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-agents-"));
    try {
      const registry = await loadRegistry("registry");
      const selection = resolveAgents({ registry, projectType: "monorepo", mode: "custom", selected: ["backend", "reviewer"] });
      const result = await renderCodexAgents(root, selection);
      expect(result.ownership).toEqual([
        { path: "AGENTS.md", owner: "adapter:codex" },
        { path: "agents/backend.toml", owner: "agent:backend", version: selection.enabled.find((agent) => agent.id === "backend")?.version },
        { path: "agents/reviewer.toml", owner: "agent:reviewer", version: selection.enabled.find((agent) => agent.id === "reviewer")?.version }
      ]);

      expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("agents/backend.toml");
      expect(await readFile(path.join(root, "agents/reviewer.toml"), "utf8")).toContain("review_only = true");
      await expect(readFile(path.join(root, "agents/frontend.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses standalone Web paths and commands for a Web project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-web-agent-"));
    try {
      const registry = await loadRegistry("registry");
      const selection = resolveAgents({ registry, projectType: "web", mode: "automatic" });
      await renderCodexAgents(root, selection);
      const role = await readFile(path.join(root, "agents/frontend.toml"), "utf8");
      expect(role).toContain('owns = ["src"]');
      expect(role).toContain('commands = ["pnpm build"]');
      const reviewer = await readFile(path.join(root, "agents/reviewer.toml"), "utf8");
      expect(reviewer).toContain('commands = ["pnpm build"]');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses standalone API paths and commands for an API project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-api-agent-"));
    try {
      const registry = await loadRegistry("registry");
      const selection = resolveAgents({ registry, projectType: "api", mode: "automatic" });
      await renderCodexAgents(root, selection);
      const role = await readFile(path.join(root, "agents/backend.toml"), "utf8");
      expect(role).toContain('owns = ["src"]');
      expect(role).toContain('commands = ["pnpm build"]');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
