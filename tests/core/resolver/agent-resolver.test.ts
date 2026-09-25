import { describe, expect, it } from "vitest";

import { loadRegistry } from "../../../src/core/registry/registry-loader.js";
import { Registry } from "../../../src/core/registry/registry-loader.js";
import { resolveAgents } from "../../../src/core/resolver/agent-resolver.js";

const registry = await loadRegistry("registry");

describe("resolveAgents", () => {
  it("selects the current Monorepo roles from registry metadata with explanations", () => {
    const result = resolveAgents({ registry, projectType: "monorepo", mode: "automatic" });
    expect(result.enabled.map((agent) => agent.id)).toEqual(["frontend", "backend", "shared", "reviewer"]);
    expect(result.enabled.every((agent) => agent.reason.length > 0)).toBe(true);
  });

  it("selects only the relevant specialist for a frontend task", () => {
    const result = resolveAgents({ registry, projectType: "monorepo", mode: "automatic", task: {
      intent: "feature", targetPaths: ["apps/web/src/App.tsx"], text: "Change button padding"
    } });
    expect(result.enabled.map((agent) => agent.id)).toEqual(["frontend"]);
  });

  it("includes Security for authentication work and keeps Reviewer advisory", () => {
    const result = resolveAgents({ registry, projectType: "monorepo", mode: "automatic", task: {
      intent: "feature", targetPaths: ["apps/api/src/auth/router.ts"], text: "Change login authorization"
    } });
    expect(result.enabled.map((agent) => agent.id)).toEqual(["backend", "security"]);
    expect(result.recommended.map((agent) => agent.id)).toContain("reviewer");
  });

  it("infers bugfix intent from the task when none is supplied", () => {
    const result = resolveAgents({ registry, projectType: "monorepo", mode: "automatic", task: {
      targetPaths: ["apps/api/src/auth/router.ts"], text: "Fix broken login authorization"
    } });
    expect(result.taskIntent).toBe("bugfix");
    expect(result.enabled.map((agent) => agent.id)).toEqual(["backend", "security"]);
    expect(result.explanation[0]).toContain("Intent: bugfix");
  });

  it("keeps a required Security review in none mode for authentication changes", () => {
    const result = resolveAgents({ registry, projectType: "monorepo", mode: "none", task: {
      targetPaths: ["apps/api/src/auth/router.ts"], text: "Fix authentication permissions"
    } });
    expect(result.enabled.map((agent) => agent.id)).toEqual(["security"]);
    expect(result.enabled[0]?.required).toBe(true);
  });

  it("supports none, recommended and validated custom modes", () => {
    expect(resolveAgents({ registry, projectType: "monorepo", mode: "none" }).enabled).toEqual([]);
    expect(resolveAgents({ registry, projectType: "monorepo", mode: "recommended" }).recommended.map((agent) => agent.id))
      .toEqual(["frontend", "backend", "shared", "reviewer"]);
    expect(resolveAgents({ registry, projectType: "monorepo", mode: "custom", selected: ["backend", "reviewer"] }).enabled.map((agent) => agent.id))
      .toEqual(["backend", "reviewer"]);
    expect(() => resolveAgents({ registry, projectType: "monorepo", mode: "custom", selected: ["missing"] }))
      .toThrow('Agent "missing" is not available.');
  });

  it("rejects an agent without render metadata before creation", () => {
    const incomplete = new Registry([
      { schemaVersion: 1, id: "web", kind: "project-type", version: "1.0.0", displayName: "Web", agentHints: { required: [], recommended: ["frontend"] } },
      { schemaVersion: 1, id: "frontend", kind: "agent", version: "1.0.0", displayName: "Frontend" }
    ]);
    expect(() => resolveAgents({ registry: incomplete, projectType: "web", mode: "automatic" }))
      .toThrow('Agent "frontend" has no rendering metadata.');
  });
});
