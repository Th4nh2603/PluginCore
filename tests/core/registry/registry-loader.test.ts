import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadRegistry } from "../../../src/core/registry/registry-loader.js";

const fixtureRoot = (...segments: string[]): string => path.join(process.cwd(), "tests", "fixtures", ...segments);

describe("loadRegistry", () => {
  it("loads manifests into an ID and kind index", async () => {
    const registry = await loadRegistry(fixtureRoot("registry"));

    expect(registry.get("project-type", "web-application")?.version).toBe("1.0.0");
    expect(registry.get("agent", "security")?.kind).toBe("agent");
    expect(registry.list("project-type").map((manifest) => manifest.id)).toEqual(["web-application"]);
  });

  it("rejects duplicate kind and ID entries", async () => {
    await expect(loadRegistry(fixtureRoot("conflict"))).rejects.toMatchObject({
      code: "REGISTRY_CONFLICT"
    });
  });

  it("rejects a manifest missing its kind", async () => {
    await expect(loadRegistry(fixtureRoot("invalid"))).rejects.toMatchObject({
      code: "MANIFEST_INVALID"
    });
  });
});
