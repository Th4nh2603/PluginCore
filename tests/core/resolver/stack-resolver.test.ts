import { describe, expect, it } from "vitest";

import { ExtensionManifestSchema, type ExtensionManifest } from "../../../src/core/registry/manifest.js";
import { Registry } from "../../../src/core/registry/registry-loader.js";
import { listStackChoices, resolveStack } from "../../../src/core/resolver/stack-resolver.js";

const manifest = (value: unknown): ExtensionManifest => ExtensionManifestSchema.parse(value);

const projectType = manifest({
  schemaVersion: 1,
  id: "monorepo",
  kind: "project-type",
  version: "1.0.0",
  displayName: "Monorepo",
  stack: {
    slots: [
      { id: "workspace", label: "Workspace", required: true },
      { id: "frontend-framework", label: "Frontend framework", allowNone: true },
      { id: "frontend-library", label: "Frontend library", allowNone: true },
      { id: "backend-framework", label: "Backend framework", allowNone: true },
      { id: "language", label: "Language", required: true },
      { id: "testing", label: "Testing", allowNone: true }
    ]
  }
});

const component = (
  id: string,
  slot: string,
  options: {
    readonly compatibleWith?: Readonly<Record<string, readonly string[]>>;
    readonly dependencies?: readonly string[];
    readonly projectTypes?: readonly string[];
  } = {}
): ExtensionManifest => manifest({
  schemaVersion: 1,
  id,
  kind: "stack-component",
  version: "1.0.0",
  displayName: id,
  compatibility: { projectTypes: options.projectTypes ?? ["monorepo"] },
  stack: {
    slot,
    ...(options.compatibleWith === undefined ? {} : { compatibleWith: options.compatibleWith })
  },
  ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies })
});

const baseEntries: ExtensionManifest[] = [
  projectType,
  component("pnpm-workspaces", "workspace"),
  component("vite", "frontend-framework", { compatibleWith: { "frontend-library": ["react"] } }),
  component("react", "frontend-library"),
  component("vue", "frontend-library"),
  component("express", "backend-framework"),
  component("typescript", "language"),
  component("vitest", "testing"),
  component("web-only", "testing", { projectTypes: ["web"] })
];

describe("stack resolver", () => {
  it("lists choices by slot, project compatibility, and previous selections", () => {
    const registry = new Registry(baseEntries);

    const choices = listStackChoices({
      registry,
      projectType: "monorepo",
      slot: "frontend-library",
      selected: [{ slot: "frontend-framework", componentId: "vite" }]
    });

    expect(choices.map((choice) => choice.id)).toEqual(["react"]);
  });

  it("allows optional slots to be omitted while requiring required slots", () => {
    const registry = new Registry(baseEntries);

    const resolution = resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "workspace", componentId: "pnpm-workspaces" },
        { slot: "language", componentId: "typescript" }
      ]
    });

    expect(resolution.stack).toEqual({
      workspace: "pnpm-workspaces@1.0.0",
      language: "typescript@1.0.0"
    });
  });

  it("auto-selects stack-component dependencies and records why", () => {
    const registry = new Registry([
      ...baseEntries.filter((entry) => entry.id !== "vite"),
      component("nextjs", "frontend-framework", { dependencies: ["react"] })
    ]);

    const resolution = resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "workspace", componentId: "pnpm-workspaces" },
        { slot: "frontend-framework", componentId: "nextjs" },
        { slot: "language", componentId: "typescript" }
      ]
    });

    expect(resolution.stack["frontend-library"]).toBe("react@1.0.0");
    expect(resolution.entries).toContainEqual({
      slot: "frontend-library",
      id: "react",
      version: "1.0.0",
      source: "auto",
      reason: "required by nextjs"
    });
  });

  it("resolves automatic dependencies before required slots are complete", () => {
    const registry = new Registry([
      ...baseEntries.filter((entry) => entry.id !== "vite"),
      component("nextjs", "frontend-framework", { dependencies: ["react"] })
    ]);

    const resolution = resolveStack({
      registry,
      projectType: "monorepo",
      selections: [{ slot: "frontend-framework", componentId: "nextjs" }],
      requireComplete: false
    });

    expect(resolution.entries).toContainEqual({
      slot: "frontend-library",
      id: "react",
      version: "1.0.0",
      source: "auto",
      reason: "required by nextjs"
    });
  });

  it("rejects an automatic dependency when the user explicitly selected None for that slot", () => {
    const registry = new Registry([
      ...baseEntries.filter((entry) => entry.id !== "vite"),
      component("nextjs", "frontend-framework", { dependencies: ["react"] })
    ]);

    expect(() => resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "frontend-framework", componentId: "nextjs" },
        { slot: "frontend-library", componentId: null }
      ],
      requireComplete: false
    })).toThrow(/requires.*react.*frontend-library.*None/i);
  });

  it("rejects an automatic dependency that conflicts with an explicit selection", () => {
    const registry = new Registry([
      ...baseEntries.filter((entry) => entry.id !== "vite"),
      component("nextjs", "frontend-framework", { dependencies: ["react"] })
    ]);

    expect(() => resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "workspace", componentId: "pnpm-workspaces" },
        { slot: "frontend-framework", componentId: "nextjs" },
        { slot: "frontend-library", componentId: "vue" },
        { slot: "language", componentId: "typescript" }
      ]
    })).toThrow(/requires.*react.*frontend-library.*vue/i);
  });

  it("rejects incompatible selected components", () => {
    const registry = new Registry(baseEntries);

    expect(() => resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "workspace", componentId: "pnpm-workspaces" },
        { slot: "frontend-framework", componentId: "vite" },
        { slot: "frontend-library", componentId: "vue" },
        { slot: "language", componentId: "typescript" }
      ]
    })).toThrow(/vite.*frontend-library.*vue/i);
  });

  it("rejects dependency cycles", () => {
    const registry = new Registry([
      projectType,
      component("pnpm-workspaces", "workspace"),
      component("typescript", "language"),
      component("alpha", "frontend-framework", { dependencies: ["beta"] }),
      component("beta", "frontend-library", { dependencies: ["alpha"] })
    ]);

    expect(() => resolveStack({
      registry,
      projectType: "monorepo",
      selections: [
        { slot: "workspace", componentId: "pnpm-workspaces" },
        { slot: "frontend-framework", componentId: "alpha" },
        { slot: "language", componentId: "typescript" }
      ]
    })).toThrow(/cycle/i);
  });
});
