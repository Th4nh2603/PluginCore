import { describe, expect, it } from "vitest";

import { Registry } from "../../../src/core/registry/registry-loader.js";
import type { ExtensionManifest } from "../../../src/core/registry/manifest.js";
import { resolveCapabilities } from "../../../src/core/resolver/capability-resolver.js";

const capability = (
  id: string,
  projectTypes: readonly string[],
  dependencies: readonly string[] = []
): ExtensionManifest => ({
  schemaVersion: 1,
  id,
  kind: "capability",
  version: "1.0.0",
  displayName: id,
  compatibility: { projectTypes: [...projectTypes] },
  dependencies: [...dependencies]
});

describe("resolveCapabilities", () => {
  it("resolves requested capabilities into config and selected extension references", () => {
    const registry = new Registry([capability("auth-custom", ["monorepo"])]);

    const result = resolveCapabilities({ registry, projectType: "monorepo", requested: ["auth-custom"] });

    expect(result.capabilities).toEqual([{ id: "auth-custom", version: "1.0.0" }]);
    expect(result.selected).toEqual([
      { kind: "capability", id: "auth-custom", version: "1.0.0" }
    ]);
  });

  it("rejects a missing capability", () => {
    const registry = new Registry([]);

    expect(() => resolveCapabilities({ registry, projectType: "monorepo", requested: ["auth-custom"] }))
      .toThrow('Capability "auth-custom" is not available.');
  });

  it("rejects a capability incompatible with the project type", () => {
    const registry = new Registry([capability("auth-custom", ["monorepo"])]);

    expect(() => resolveCapabilities({ registry, projectType: "web", requested: ["auth-custom"] }))
      .toThrow('Capability "auth-custom" is not compatible with web.');
  });

  it("resolves capability dependencies before their dependent capability", () => {
    const registry = new Registry([
      capability("session-core", ["monorepo"]),
      capability("auth-custom", ["monorepo"], ["session-core"])
    ]);

    const result = resolveCapabilities({ registry, projectType: "monorepo", requested: ["auth-custom"] });

    expect(result.capabilities.map((item) => item.id)).toEqual(["session-core", "auth-custom"]);
  });
});
