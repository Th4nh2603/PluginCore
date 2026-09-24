import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";

interface ParsedRepoConfig {
  readonly composition: {
    readonly preset?: string;
    readonly authentication?: string;
    readonly capabilities?: readonly { readonly id: string; readonly version: string }[];
  };
}

const readConfig = async (targetDirectory: string): Promise<ParsedRepoConfig> =>
  parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8")) as ParsedRepoConfig;

const writeEmptyRegistry = async (registryRoot: string): Promise<void> => {
  await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
  await writeFile(
    path.join(registryRoot, "project-types", "empty", "manifest.yaml"),
    "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n",
    "utf8"
  );
};

describe("runCli", () => {
  it("adds MCP to an API selected interactively", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-mcp-api-"));
    const targetDirectory = path.join(root, "service");
    try {
      const exitCode = await runCli(["create", "service", "--type", "api", "--preset", "recommended-api", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message) => message === "Install stack" ? "install" : "invalid",
          confirm: async (message) => message === "Include MCP server?"
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).composition.capabilities?.map(({ id }) => id)).toContain("mcp-server");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("accepts the scripted MCP capability", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-mcp-scripted-"));
    const targetDirectory = path.join(root, "platform");
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--preset", "recommended-monorepo", "--capability", "mcp-server", "--target", targetDirectory, "--yes"], {
        write: () => undefined, generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).composition.capabilities?.map(({ id }) => id)).toEqual(["auth-custom", "mcp-server"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects MCP for Web without creating files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-mcp-web-cli-"));
    const targetDirectory = path.join(root, "web-demo");
    try {
      const exitCode = await runCli(["create", "web-demo", "--type", "web", "--preset", "recommended-web", "--capability", "mcp-server", "--target", targetDirectory, "--yes"], {
        write: () => undefined, generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

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
    await writeEmptyRegistry(registryRoot);
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
    await writeEmptyRegistry(registryRoot);
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
    await writeEmptyRegistry(registryRoot);
    try {
      const exitCode = await runCli(["create", "--target", targetDirectory, "--registry", registryRoot], {
        write: () => undefined,
        prompt: {
          input: async () => "interactive-demo",
          select: async (message: string) => {
            if (message === "Project type") return "empty";
            if (message === "Setup") return "custom";
            if (message === "Install stack") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => { throw new Error("confirm must not be used by the create wizard"); }
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets the user select the recommended preset from the list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-recommended-"));
    const targetDirectory = path.join(root, "web-demo");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Project type") return "web";
            if (message === "Setup") return "recommended";
            if (message === "Recommended preset") return "recommended-web";
            if (message === "Install stack") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => { throw new Error("confirm must not be used by the create wizard"); }
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("Recommended Web");
      expect(output.join("\n")).toContain("Framework: Vite");
      expect(output.join("\n")).not.toContain("Testing: Vitest");
      expect(output.join("\n")).not.toContain("tailwind");
      expect((await readConfig(targetDirectory)).composition.preset).toBe("recommended-web@1.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses concise project type names in the wizard", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-monorepo-"));
    const targetDirectory = path.join(root, "monorepo-demo");
    let monorepoOption = "";
    try {
      const exitCode = await runCli(["create", "monorepo-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            if (message === "Project type") {
              monorepoOption = choices.find((choice) => choice.value === "monorepo")?.name ?? "";
              return "empty";
            }
            if (message === "Setup") return "custom";
            if (message === "Continue") return "yes";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect(monorepoOption).toBe("Monorepo");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("shows registry-driven preview and generic next-step guidance after Monorepo creation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-monorepo-cli-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Project type") return "monorepo";
            if (message === "Start from") return "recommended";
            if (message === "Configure stack") return "continue";
            if (message === "Review") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("Frontend: React");
      expect(output.join("\n")).toContain("Project created and dependencies installed.");
      expect(output.join("\n")).toContain(`cd "${targetDirectory}"`);
      expect(output.join("\n")).toContain("pnpm dev");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the authentication selected during Custom Monorepo setup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-auth-choice-"));
    const targetDirectory = path.join(root, "platform");
    let configureCount = 0;
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Start from") return "custom";
            if (message === "Configure stack") return ["edit:frontend", "edit:backend", "edit:orm", "edit:auth", "continue"][configureCount++] ?? "invalid";
            if (message === "Authentication") return "clerk";
            if (message === "Frontend") return "react";
            if (message === "Backend") return "express";
            if (message === "ORM") return "prisma";
            if (message === "Review") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      const config = await readConfig(targetDirectory);
      expect(config.composition.authentication).toBe("clerk");
      expect(config.composition.preset).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unregistered authentication capability", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-invalid-auth-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--auth", "firebase", "--target", targetDirectory, "--yes"], {
        write: (line) => output.push(line),
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(2);
      expect(output.join("\n")).toContain('Authentication capability "auth-firebase" is not available for monorepo.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps --auth clerk to the Clerk capability", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-clerk-option-"));
    const targetDirectory = path.join(root, "platform");
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--auth", "clerk", "--target", targetDirectory, "--yes"], {
        write: () => undefined,
        generatorRunner: { run: async () => undefined }
      });

      expect(exitCode).toBe(0);
      const config = await readConfig(targetDirectory);
      expect(config.composition.capabilities).toContainEqual({ id: "auth-clerk", version: "1.0.0" });
      expect(existsSync(path.join(targetDirectory, "apps/api/src/auth/router.ts"))).toBe(false);
      expect(await readFile(path.join(targetDirectory, "apps/web/src/App.tsx"), "utf8")).toContain("@clerk/react");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an authentication capability incompatible with the project type", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-web-auth-"));
    const targetDirectory = path.join(root, "web-demo");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "web-demo", "--type", "web", "--auth", "clerk", "--target", targetDirectory, "--yes"], {
        write: (line) => output.push(line),
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
      expect(output.join("\n")).toContain('Authentication capability "auth-clerk" is not available for web.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses Custom setup when selected", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-"));
    const targetDirectory = path.join(root, "web-demo");
    try {
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Project type") return "web";
            if (message === "Setup") return "custom";
            if (message === "Frontend") return "react";
            if (message === "Install stack") return "install";
            if (message === "Continue") return "yes";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).composition.preset).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates after selecting and approving a Custom stack", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-confirm-"));
    const targetDirectory = path.join(root, "web-demo");
    const selectMessages: string[] = [];
    try {
      const exitCode = await runCli(["create", "web-demo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            selectMessages.push(message);
            if (message === "Project type") return "web";
            if (message === "Setup") return "custom";
            if (message === "Frontend") return "react";
            if (message === "Install stack") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => { throw new Error("confirm must not be used by the create wizard"); }
        },
        generatorRunner: { run: async () => undefined }
      } as never);
      expect(exitCode).toBe(0);
      expect(selectMessages).toEqual(["Project type", "Setup", "Frontend", "Install stack"]);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
