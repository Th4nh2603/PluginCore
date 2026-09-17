import { describe, expect, it } from "vitest";

import { Registry } from "../../../src/core/registry/registry-loader.js";
import type { ExtensionManifest } from "../../../src/core/registry/manifest.js";
import { resolveCreateComposition } from "../../../src/core/resolver/create-resolver.js";

const projectType: ExtensionManifest = {
  schemaVersion: 1,
  id: "monorepo",
  kind: "project-type",
  version: "1.0.0",
  displayName: "Monorepo"
};

const authClerk: ExtensionManifest = {
  schemaVersion: 1,
  id: "auth-clerk",
  kind: "capability",
  version: "1.0.0",
  displayName: "Managed Authentication",
  compatibility: { projectTypes: ["monorepo"] }
};

describe("create resolver capability-backed authentication", () => {
  it("maps the legacy authentication choice to a resolved capability", () => {
    const registry = new Registry([projectType, authClerk]);

    const resolution = resolveCreateComposition({
      name: "platform",
      projectType: "monorepo",
      stack: {},
      capabilities: [],
      agentMode: "automatic",
      authentication: "clerk",
      registry
    });

    expect(resolution.config.composition.capabilities).toEqual([
      { id: "auth-clerk", version: "1.0.0" }
    ]);
    expect(resolution.config.composition.authentication).toBe("clerk");
    expect(resolution.selected).toContainEqual({
      kind: "capability",
      id: "auth-clerk",
      version: "1.0.0"
    });
  });
});
