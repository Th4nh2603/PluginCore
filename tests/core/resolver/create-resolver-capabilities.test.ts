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

const stackProjectType: ExtensionManifest = {
  schemaVersion: 1,
  id: "stack-monorepo",
  kind: "project-type",
  version: "1.0.0",
  displayName: "Stack Monorepo",
  stack: { slots: [
    { id: "frontend-framework", label: "Frontend framework", allowNone: true },
    { id: "frontend-library", label: "Frontend library", allowNone: true }
  ] }
};

const vite: ExtensionManifest = {
  schemaVersion: 1,
  id: "vite",
  kind: "stack-component",
  version: "8.0.0",
  displayName: "Vite",
  compatibility: { projectTypes: ["stack-monorepo"] },
  stack: { slot: "frontend-framework", compatibleWith: { "frontend-library": ["vue"] } }
};

const vue: ExtensionManifest = {
  schemaVersion: 1,
  id: "vue",
  kind: "stack-component",
  version: "3.0.0",
  displayName: "Vue",
  compatibility: { projectTypes: ["stack-monorepo"] },
  stack: { slot: "frontend-library" }
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

  it("rejects a capability that the manifest marks incompatible with the selected stack", () => {
    const stackRestrictedClerk: ExtensionManifest = {
      ...authClerk,
      compatibility: { projectTypes: ["stack-monorepo"], stack: { "frontend-library": ["react"] } }
    };
    const registry = new Registry([stackProjectType, vite, vue, stackRestrictedClerk]);

    expect(() => resolveCreateComposition({
      name: "platform",
      projectType: "stack-monorepo",
      stack: { "frontend-framework": "vite@8.0.0", "frontend-library": "vue@3.0.0" },
      capabilities: [],
      agentMode: "automatic",
      authentication: "clerk",
      registry
    })).toThrow('Capability "auth-clerk" is not compatible with the selected stack.');
  });
});
