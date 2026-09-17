import { describe, expect, it } from "vitest";

import { ExtensionManifestSchema, type ExtensionManifest } from "../../../src/core/registry/manifest.js";
import { Registry } from "../../../src/core/registry/registry-loader.js";
import { resolveCreateComposition } from "../../../src/core/resolver/create-resolver.js";

const manifest = (value: unknown): ExtensionManifest => ExtensionManifestSchema.parse(value);

const monorepo = manifest({
  schemaVersion: 1,
  id: "monorepo",
  kind: "project-type",
  version: "1.0.0",
  displayName: "Monorepo",
  stack: {
    slots: [
      { id: "workspace", label: "Workspace", required: true },
      { id: "frontend-framework", label: "Frontend framework", allowNone: true },
      { id: "language", label: "Language", required: true }
    ]
  }
});

const component = (id: string, slot: string): ExtensionManifest => manifest({
  schemaVersion: 1,
  id,
  kind: "stack-component",
  version: "1.0.0",
  displayName: id,
  compatibility: { projectTypes: ["monorepo"] },
  stack: { slot }
});

const registry = new Registry([
  monorepo,
  component("pnpm-workspaces", "workspace"),
  component("vite", "frontend-framework"),
  component("typescript", "language"),
  manifest({
    schemaVersion: 1,
    id: "recommended-monorepo",
    kind: "preset",
    version: "1.0.0",
    displayName: "Recommended Monorepo",
    compatibility: { projectTypes: ["monorepo"] },
    selection: {
      stack: {
        workspace: "pnpm-workspaces@1",
        "frontend-framework": "vite@1",
        language: "typescript@1"
      }
    }
  })
]);

const resolve = (overrides: Partial<Parameters<typeof resolveCreateComposition>[0]> = {}) => resolveCreateComposition({
  name: "demo",
  projectType: "monorepo",
  stack: {},
  capabilities: [],
  agentMode: "automatic",
  registry,
  ...overrides
});

describe("create resolver stack integration", () => {
  it("normalizes a valid custom stack to canonical references", () => {
    const resolution = resolve({
      stack: {
        workspace: "pnpm-workspaces",
        "frontend-framework": "vite",
        language: "typescript"
      }
    });

    expect(resolution.config.composition.stack).toEqual({
      workspace: "pnpm-workspaces@1.0.0",
      "frontend-framework": "vite@1.0.0",
      language: "typescript@1.0.0"
    });
  });

  it("rejects a component selected for the wrong slot", () => {
    expect(() => resolve({
      stack: {
        workspace: "pnpm-workspaces",
        "frontend-framework": "typescript",
        language: "typescript"
      }
    })).toThrow(/typescript.*belongs to slot.*language.*frontend-framework/i);
  });

  it("keeps a valid preset stack after resolver normalization", () => {
    const resolution = resolve({ preset: "recommended-monorepo" });

    expect(resolution.config.composition.stack).toEqual({
      workspace: "pnpm-workspaces@1.0.0",
      "frontend-framework": "vite@1.0.0",
      language: "typescript@1.0.0"
    });
  });
});
