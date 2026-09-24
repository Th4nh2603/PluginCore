import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planCreate } from "../../src/application/create-service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("planCreate resolution boundary", () => {
  it("rejects MCP on Web before creating files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-mcp-web-"));
    roots.push(root);
    const targetDirectory = path.join(root, "demo");
    await expect(planCreate({
      name: "demo", projectType: "web", targetDirectory,
      registryRoot: path.resolve("registry"), preset: "recommended-web", stack: {},
      agentMode: "automatic", capabilities: [{ id: "mcp-server", version: "1.0.0" }]
    })).rejects.toThrow(/not compatible|not available/i);
    expect(existsSync(targetDirectory)).toBe(false);
  });
  it("rejects a stack value that violates the canonical extension reference schema", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-resolution-"));
    roots.push(root);
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "web"), { recursive: true });
    await writeFile(
      path.join(registryRoot, "project-types", "web", "manifest.yaml"),
      "schemaVersion: 1\nid: web\nkind: project-type\nversion: 1.0.0\ndisplayName: Web\n",
      "utf8"
    );

    await expect(
      planCreate({
        name: "demo",
        projectType: "web",
        targetDirectory: path.join(root, "demo"),
        registryRoot,
        stack: { framework: "vite plus react" },
        agentMode: "automatic",
        capabilities: []
      })
    ).rejects.toThrow("Invalid");
  });
});
