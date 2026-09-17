import { describe, expect, it } from "vitest";

import { ExtensionManifestSchema } from "../../../src/core/registry/manifest.js";

describe("extension manifest capability selection", () => {
  it("preserves preset capability selections", () => {
    const manifest = ExtensionManifestSchema.parse({
      schemaVersion: 1,
      id: "recommended-monorepo",
      kind: "preset",
      version: "1.0.0",
      displayName: "Recommended Monorepo",
      selection: {
        stack: { workspace: "pnpm-workspaces@10" },
        capabilities: ["auth-custom"]
      }
    });

    expect(manifest.selection?.capabilities).toEqual(["auth-custom"]);
  });
});
