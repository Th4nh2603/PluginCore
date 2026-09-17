import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadRegistry } from "../../../src/core/registry/registry-loader.js";

describe("built-in stack components", () => {
  it("registers every component referenced by the recommended monorepo preset", async () => {
    const registry = await loadRegistry(path.join(process.cwd(), "registry"));
    const ids = registry.list("stack-component").map((entry) => entry.id);

    expect(ids).toEqual(expect.arrayContaining([
      "pnpm-workspaces",
      "vite",
      "react",
      "express",
      "typescript",
      "vitest"
    ]));
  });

  it("exposes slot metadata for the built-in monorepo stack", async () => {
    const registry = await loadRegistry(path.join(process.cwd(), "registry"));
    const slotById = Object.fromEntries(
      registry.list("stack-component").map((entry) => [entry.id, entry.stack?.slot])
    );

    expect(slotById).toMatchObject({
      "pnpm-workspaces": "workspace",
      vite: "frontend-framework",
      react: "frontend-library",
      express: "backend-framework",
      typescript: "language",
      vitest: "testing"
    });
  });
});
