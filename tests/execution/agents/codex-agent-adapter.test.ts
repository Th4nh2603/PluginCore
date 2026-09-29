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
  it("defines concrete tasks for every automatic Monorepo role", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-monorepo-agents-"));
    try {
      const registry = await loadRegistry("registry");
      const selection = resolveAgents({ registry, projectType: "monorepo", mode: "automatic" });
      await renderCodexAgents(root, selection);
      const index = await readFile(path.join(root, "AGENTS.md"), "utf8");
      expect(selection.enabled.map((agent) => agent.id)).toEqual(["frontend", "backend", "shared", "reviewer"]);
      for (const agent of selection.enabled) {
        const tasks = agent.manifest.agent?.responsibilities ?? [];
        expect(tasks.length).toBeGreaterThan(0);
        expect(index).toContain(`## ${agent.manifest.displayName} (\`${agent.id}\`)`);
        for (const task of tasks) expect(index).toContain(task);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
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

      const index = await readFile(path.join(root, "AGENTS.md"), "utf8");
      expect(index).toContain("agents/backend.toml");
      expect(index).toContain("## Backend Agent (`backend`)");
      expect(index).toContain("Owns backend API work.");
      expect(index).toContain("Scope: `apps/api`");
      expect(index).toContain("Own API routes and validation.");
      expect(index).toContain("Tasks:");
      expect(index).toContain("Implement API routes and validate request inputs.");
      expect(index).toContain("Report findings with file paths and verification evidence.");
      expect(index).toContain("Verify: `pnpm --filter ./apps/api build`");
      expect(index).toContain("## Reviewer Agent (`reviewer`)");
      expect(index).toContain("Review only: do not edit source files.");
      const reviewer = await readFile(path.join(root, "agents/reviewer.toml"), "utf8");
      expect(reviewer).toContain("review_only = true");
      expect(reviewer).toContain('display_name = "Reviewer Agent"');
      expect(reviewer).toContain('description = "Reviews changes across workspace boundaries without implementing them."');
      expect(reviewer).toContain('expertise = ["review", "testing"]');
      expect(reviewer).toContain('responsibilities = ["Inspect changes for correctness, regressions, and security risks."');
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
