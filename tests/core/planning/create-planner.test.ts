import { describe, expect, it } from "vitest";

import type { RepoConfig } from "../../../src/core/config/repo-config.js";
import { planCreateExecution } from "../../../src/core/planning/create-planner.js";
import type { CreateResolutionPlan } from "../../../src/core/resolver/create-resolver.js";

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

const resolution: CreateResolutionPlan = {
  config,
  selected: [{ kind: "project-type", id: "web", version: "1.0.0" }],
  unresolved: [],
  diagnostics: []
};

describe("planCreateExecution", () => {
  it("orders generation before config, phased verification, and managed-state recording", () => {
    const plan = planCreateExecution({ resolution, targetDirectory: "/tmp/demo" });

    expect(plan.targetDirectory).toBe("/tmp/demo");
    expect(plan.operations.map((operation) => operation.type)).toEqual([
      "generate",
      "write-config",
      "verify",
      "record-state",
      "verify"
    ]);
    expect(plan.operations.filter((operation) => operation.type === "verify").map((operation) => operation.phase))
      .toEqual(["generated", "managed-state"]);
  });

  it("uses generic extension metadata instead of framework-specific planning branches", () => {
    const plan = planCreateExecution({ resolution, targetDirectory: "/tmp/demo" });
    const operation = plan.operations[0];

    expect(operation).toMatchObject({
      type: "generate",
      extension: { kind: "project-type", id: "web", version: "1.0.0" },
      targetDirectory: "/tmp/demo"
    });
  });
});
