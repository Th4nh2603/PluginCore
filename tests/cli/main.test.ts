import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../../src/cli/main.js";

describe("runCli", () => {
  it("prints command help without reading the filesystem", async () => {
    const output: string[] = [];

    const exitCode = await runCli(["--help"], { write: (line) => output.push(line) });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("repo create <name>");
  });

  it("prints the plugin identifier and version", async () => {
    const output: string[] = [];

    const exitCode = await runCli(["info"], { write: (line) => output.push(line) });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("repo-standard");
    expect(output.join("\n")).toContain("0.1.0");
  });

  it("requires --yes before a non-interactive create writes files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-cli-"));
    const registryRoot = path.join(root, "registry");
    const targetDirectory = path.join(root, "demo");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", "utf8");

    try {
      const output: string[] = [];
      const exitCode = await runCli(["create", "demo", "--type", "empty", "--target", targetDirectory, "--registry", registryRoot], { write: (line) => output.push(line) });

      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
      expect(output.join("\n")).toContain("--yes");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates a managed repository after --yes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-cli-"));
    const registryRoot = path.join(root, "registry");
    const targetDirectory = path.join(root, "demo");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", "utf8");

    try {
      const exitCode = await runCli(["create", "demo", "--type", "empty", "--target", targetDirectory, "--registry", registryRoot, "--yes"], { write: () => undefined });

      expect(exitCode).toBe(0);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prompts for a missing name and type before creating", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-cli-"));
    const registryRoot = path.join(root, "registry");
    const targetDirectory = path.join(root, "interactive-demo");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", "utf8");

    try {
      const exitCode = await runCli(["create", "--target", targetDirectory, "--registry", registryRoot], {
        write: () => undefined,
        prompt: {
          input: async () => "interactive-demo",
          select: async () => "empty",
          confirm: async () => true
        }
      } as never);

      expect(exitCode).toBe(0);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
