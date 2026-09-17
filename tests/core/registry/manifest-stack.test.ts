import { describe, expect, it } from "vitest";

import { ExtensionManifestSchema } from "../../../src/core/registry/manifest.js";

describe("stack manifest metadata", () => {
  it("parses ordered stack slots on a project type", () => {
    const manifest = ExtensionManifestSchema.parse({
      schemaVersion: 1,
      id: "monorepo",
      kind: "project-type",
      version: "1.0.0",
      displayName: "Monorepo",
      stack: {
        slots: [
          { id: "workspace", label: "Workspace", required: true },
          { id: "frontend-framework", label: "Frontend framework", allowNone: true }
        ]
      }
    });

    expect(manifest.stack?.slots?.map((slot) => slot.id)).toEqual(["workspace", "frontend-framework"]);
  });

  it("parses stack-component slot and compatibility metadata", () => {
    const manifest = ExtensionManifestSchema.parse({
      schemaVersion: 1,
      id: "vite",
      kind: "stack-component",
      version: "8.0.0",
      displayName: "Vite",
      compatibility: { projectTypes: ["web", "monorepo"] },
      stack: {
        slot: "frontend-framework",
        compatibleWith: { "frontend-library": ["react"] }
      }
    });

    expect(manifest.stack?.slot).toBe("frontend-framework");
    expect(manifest.stack?.compatibleWith?.["frontend-library"]).toEqual(["react"]);
  });

  it("rejects a slot that is both required and nullable", () => {
    expect(() => ExtensionManifestSchema.parse({
      schemaVersion: 1,
      id: "monorepo",
      kind: "project-type",
      version: "1.0.0",
      displayName: "Monorepo",
      stack: {
        slots: [{ id: "workspace", label: "Workspace", required: true, allowNone: true }]
      }
    })).toThrow();
  });
});
