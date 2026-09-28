import { describe, expect, it } from "vitest";

import { ExtensionManifestSchema } from "../../../src/core/registry/manifest.js";
import { loadRegistry } from "../../../src/core/registry/registry-loader.js";

const validFlow = {
  schemaVersion: 1,
  id: "bugfix",
  kind: "flow",
  version: "1.0.0",
  displayName: "Bugfix",
  flow: {
    intents: ["bugfix"],
    steps: [{ id: "reproduce", inputs: ["task"], outcome: "reproducible-case", expertise: ["testing"] }]
  }
};

describe("flow manifests", () => {
  it("loads the four initial flows from the registry", async () => {
    const registry = await loadRegistry("registry");
    expect(registry.list("flow").map((flow) => flow.id)).toEqual(["bugfix", "design", "feature", "review"]);
    expect(registry.get("flow", "bugfix")?.flow?.steps[0]?.outcome).toBe("reproducible-case");
    expect(registry.get("flow", "bugfix")?.flow?.steps.find((step) => step.id === "regression-test")?.gates).toEqual(["verification"]);
  });

  it("rejects unknown conditions and empty outcomes", () => {
    expect(ExtensionManifestSchema.safeParse({
      ...validFlow,
      flow: { ...validFlow.flow, steps: [{ ...validFlow.flow.steps[0], condition: "shell:true" }] }
    }).success).toBe(false);
    expect(ExtensionManifestSchema.safeParse({
      ...validFlow,
      flow: { ...validFlow.flow, steps: [{ ...validFlow.flow.steps[0], outcome: "" }] }
    }).success).toBe(false);
    expect(ExtensionManifestSchema.safeParse({
      ...validFlow,
      flow: { ...validFlow.flow, steps: [{ ...validFlow.flow.steps[0], gates: ["arbitrary-command"] }] }
    }).success).toBe(false);
  });

  it("requires flow definitions only on flow manifests", () => {
    expect(ExtensionManifestSchema.safeParse({ ...validFlow, flow: undefined }).success).toBe(false);
    expect(ExtensionManifestSchema.safeParse({ ...validFlow, kind: "agent" }).success).toBe(false);
  });
});
