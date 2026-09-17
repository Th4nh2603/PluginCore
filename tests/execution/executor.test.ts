import { describe, expect, it, vi } from "vitest";

import type { RepoConfig } from "../../src/core/config/repo-config.js";
import type { ExecutionPlan } from "../../src/core/planning/execution-plan.js";
import { executePlan } from "../../src/execution/executor.js";

const config: RepoConfig = {
  schemaVersion: 1,
  plugin: { id: "repo-standard", version: "0.1.0" },
  project: { name: "demo", type: "web", root: "." },
  composition: { stack: {}, capabilities: [] },
  agents: { mode: "automatic", enabled: [], adapters: [] },
  flows: { defaults: [] },
  standards: { overrides: [] },
  managed: { stateFile: ".repo-standard/managed-state.yaml" }
};

describe("executePlan", () => {
  it("dispatches operations in order to their matching handlers", async () => {
    const calls: string[] = [];
    const handlers = {
      generate: vi.fn(async () => { calls.push("generate"); }),
      writeConfig: vi.fn(async () => { calls.push("write-config"); }),
      verify: vi.fn(async () => { calls.push("verify"); }),
      recordState: vi.fn(async () => { calls.push("record-state"); })
    };
    const plan: ExecutionPlan = {
      targetDirectory: "/tmp/demo",
      config,
      operations: [
        {
          type: "generate",
          extension: { kind: "project-type", id: "web", version: "1.0.0" },
          targetDirectory: "/tmp/demo"
        },
        { type: "write-config", targetDirectory: "/tmp/demo", config },
        { type: "verify", targetDirectory: "/tmp/demo" },
        { type: "record-state", targetDirectory: "/tmp/demo" }
      ]
    };

    await executePlan(plan, handlers);

    expect(calls).toEqual(["generate", "write-config", "verify", "record-state"]);
    expect(handlers.generate).toHaveBeenCalledTimes(1);
    expect(handlers.writeConfig).toHaveBeenCalledTimes(1);
    expect(handlers.verify).toHaveBeenCalledTimes(1);
    expect(handlers.recordState).toHaveBeenCalledTimes(1);
  });
});
