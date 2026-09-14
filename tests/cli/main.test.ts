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

  it("uses the bundled registry when --registry is omitted", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-default-registry-"));
    const targetDirectory = path.join(root, "demo");

    try {
      const exitCode = await runCli(["create", "demo", "--type", "empty", "--target", targetDirectory, "--yes"], { write: () => undefined });

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
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("offers and applies a compatible recommended preset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-recommended-"));
    const targetDirectory = path.join(root, "web-demo");

    try {
      const output: string[] = [];
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => message === "Project type" ? "web" : "recommended-web",
          confirm: async () => true
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("Framework: vite@8");
      expect(output.join("\n")).toContain("Testing: vitest@4");
      expect((await import("yaml")).parse(await (await import("node:fs/promises")).readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8")).composition.preset).toBe("recommended-web@1.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("describes the workspaces included in the Monorepo option", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-monorepo-"));
    const targetDirectory = path.join(root, "monorepo-demo");
    let monorepoOption = "";

    try {
      await runCli(["create", "monorepo-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            if (message === "Project type") {
              monorepoOption = choices.find((choice) => choice.value === "monorepo")?.name ?? "";
              return "empty";
            }
            return "";
          },
          confirm: async () => true
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(monorepoOption).toContain("apps/web");
      expect(monorepoOption).toContain("apps/api");
      expect(monorepoOption).toContain("packages/shared");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("shows startup guidance after creating a Monorepo", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-monorepo-cli-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => message === "Project type" ? "monorepo" : "recommended-monorepo",
          confirm: async () => true
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("apps/web");
      expect(output.join("\n")).toContain("apps/api");
      expect(output.join("\n")).toContain("pnpm dev");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to Custom when the recommended stack is declined", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-"));
    const targetDirectory = path.join(root, "web-demo");
    let confirmations = 0;

    try {
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => message === "Project type" ? "web" : "recommended-web",
          confirm: async () => ++confirmations > 1
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      const config = (await import("yaml")).parse(await (await import("node:fs/promises")).readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates immediately after choosing Custom without a final confirmation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-immediate-"));
    const targetDirectory = path.join(root, "web-demo");

    try {
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => message === "Project type" ? "web" : "",
          confirm: async () => { throw new Error("The final create confirmation must not be requested."); }
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
