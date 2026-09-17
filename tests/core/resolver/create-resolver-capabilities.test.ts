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

const authCustom: ExtensionManifest = {
  schemaVersion: 1,
  id: "auth-custom",
  kind: "capability",
  version: "1.0.0",
  displayName: "Custom Authentication",
  compatibility: { projectTypes: ["monorepo"] }
};

const authClerk: ExtensionManifest = {
  schemaVersion: 1,
  id: "auth-clerk",
  kind: "capability",
  version: "1.0.0",
  displayName: "Managed Authentication",
  compatibility: { projectTypes: ["monorepo"] }
};

const recommendedMonorepo: ExtensionManifest = {
  schemaVersion: 1,
  id: "recommended-monorepo",
  kind: "preset",
  version: "1.0.0",
  displayName: "Recommended Monorepo",
  compatibility: { projectTypes: ["monorepo"] },
  selection: { stack: {}, capabilities: ["auth-custom"] }
};

const baseInput = (registry: Registry) => ({
  name: "platform",
  projectType: "monorepo",
  stack: {},
  capabilities: [],
  agentMode: "automatic" as const,
  registry
});

describe("create resolver capability-backed authentication", () => {
  it("uses capability selections from the preset by default", () => {
    const registry = new Registry([projectType, recommendedMonorepo, authCustom]);

    const resolution = resolveCreateComposition({
      ...baseInput(registry),
      preset: "recommended-monorepo"
    });

    expect(resolution.config.composition.capabilities).toEqual([
      { id: "auth-custom", version: "1.0.0" }
    ]);
    expect(resolution.config.composition.authentication).toBe("custom");
  });

  it("maps the legacy authentication choice to a resolved capability", () => {
    const registry = new Registry([projectType, authClerk]);

    const resolution = resolveCreateComposition({
      ...baseInput(registry),
      authentication: "clerk"
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

  it("lets a legacy auth choice override an auth capability selected by the preset", () => {
    const registry = new Registry([projectType, recommendedMonorepo, authCustom, authClerk]);

    const resolution = resolveCreateComposition({
      ...baseInput(registry),
      preset: "recommended-monorepo",
      authentication: "clerk"
    });

    expect(resolution.config.composition.capabilities).toEqual([
      { id: "auth-clerk", version: "1.0.0" }
    ]);
  });
});
