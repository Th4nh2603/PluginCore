import { existsSync } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  readonly agents: { readonly mode: string; readonly enabled: readonly string[] };
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
  it("accepts doctor root and registry flags and prints diagnostic counts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-doctor-cli-"));
    const registryRoot = path.join(root, "registry");
    const output: string[] = [];
    try {
      await writeEmptyRegistry(registryRoot);
      expect(await runCli(["doctor", "--project-root", root, "--registry", registryRoot], {
        write: (line) => output.push(line)
      })).toBe(0);
      expect(output.join("\n")).toContain("CONFIG_MISSING");
      expect(output.join("\n")).toContain("REGISTRY_VALID");
      expect(output.at(-1)).toBe("Summary: 1 passed, 1 warning, 0 errors.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects doctor flags without values", async () => {
    const output: string[] = [];
    expect(await runCli(["doctor", "--project-root"], { write: (line) => output.push(line) })).toBe(2);
    expect(output.join("\n")).toContain("--project-root");
  });
  it("returns an error for a project root that does not exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-missing-doctor-root-"));
    const output: string[] = [];
    try {
      expect(await runCli(["doctor", "--project-root", path.join(root, "missing")], { write: (line) => output.push(line) })).toBe(1);
      expect(output.join("\n")).toContain("CONFIG_INVALID");
      expect(output.at(-1)).toBe("Summary: 0 passed, 0 warnings, 1 error.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("explains a bugfix flow and includes its expertise in agent selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-flow-explain-"));
    const targetDirectory = path.join(root, "platform");
    const flowOutput: string[] = [];
    const agentOutput: string[] = [];
    try {
      expect(await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory, "--yes"], {
        write: () => undefined,
        generatorRunner: { run: async () => undefined }
      })).toBe(0);
      expect(await runCli(["flows", "explain", "--root", targetDirectory, "--text", "Fix broken login"], {
        write: (line) => flowOutput.push(line)
      })).toBe(0);
      expect(flowOutput.join("\n")).toContain("Flow: bugfix");
      expect(flowOutput.join("\n")).toContain("selected for bugfix");
      expect(flowOutput.join("\n")).toContain("inputs: proposed-change");
      expect(flowOutput.join("\n")).toContain("Step: regression-test");
      expect(flowOutput.join("\n")).toContain("gate: verification");
      expect(flowOutput.join("\n")).toContain("Skipped review: Review policy is not required.");

      expect(await runCli(["agents", "explain", "--root", targetDirectory, "--text", "Fix broken login"], {
        write: (line) => agentOutput.push(line)
      })).toBe(0);
      expect(agentOutput.join("\n")).toContain("testing: Required by the selected flow.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets a caller select a design flow and require review without writing files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-flow-policy-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      expect(await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory, "--yes"], {
        write: () => undefined,
        generatorRunner: { run: async () => undefined }
      })).toBe(0);
      expect(await runCli(["flows", "explain", "--root", targetDirectory, "--flow", "design", "--requires-review"], {
        write: (line) => output.push(line)
      })).toBe(0);
      expect(output.join("\n")).toContain("Step: review");
      expect(output.join("\n")).toContain("explicit selection");
      expect(output.join("\n")).not.toContain("Step: implement");
      const agentOutput: string[] = [];
      expect(await runCli(["agents", "explain", "--root", targetDirectory, "--flow", "design", "--target", "apps/web/src/App.tsx"], {
        write: (line) => agentOutput.push(line)
      })).toBe(0);
      expect(agentOutput.join("\n")).toContain("architect: Required by the selected flow.");
      expect(agentOutput.join("\n")).not.toContain("frontend:");
      const registryRoot = path.join(root, "registry");
      await cp("registry", registryRoot, { recursive: true });
      await mkdir(path.join(registryRoot, "flows", "design-lite"));
      await writeFile(path.join(registryRoot, "flows", "design-lite", "manifest.yaml"),
        "schemaVersion: 1\nid: design-lite\nkind: flow\nversion: 1.0.0\ndisplayName: Design Lite\nflow:\n  intents: [design]\n  inputs: [task]\n  steps:\n    - { id: propose, inputs: [task], outcome: proposal, expertise: [architecture] }\n");
      agentOutput.length = 0;
      expect(await runCli(["agents", "explain", "--root", targetDirectory, "--registry", registryRoot,
        "--flow", "design-lite", "--target", "apps/web/src/App.tsx"], { write: (line) => agentOutput.push(line) })).toBe(0);
      expect(agentOutput.join("\n")).not.toContain("frontend:");
      expect(agentOutput.join("\n")).toContain("Intent: design");
      await expect(runCli(["flows", "explain", "--root", targetDirectory, "--flow", "missing"], {
        write: () => undefined
      })).rejects.toThrow('Flow "missing" is not available.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("explains a task-specific agent selection from a generated project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-explain-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      expect(await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory, "--yes"], {
        write: () => undefined,
        generatorRunner: { run: async () => undefined }
      })).toBe(0);

      const exitCode = await runCli(["agents", "explain", "--root", targetDirectory,
        "--intent", "feature", "--target", "apps/api/src/auth/router.ts", "--text", "Change login authorization"], {
        write: (line) => output.push(line)
      });
      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("backend: Owns a target path");
      expect(output.join("\n")).toContain("security: Matches a feature task signal");
      expect(output.join("\n")).toContain("Recommended: reviewer");
      expect(output.join("\n")).not.toContain("frontend:");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("accepts --agents none and leaves generated projects without role files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-none-"));
    const targetDirectory = path.join(root, "platform");
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--agents", "none", "--target", targetDirectory, "--yes"], {
        write: () => undefined,
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).agents).toEqual({ mode: "none", enabled: [], adapters: [] });
      expect(existsSync(path.join(targetDirectory, "AGENTS.md"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets an interactive Monorepo choose no agents before review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-choice-"));
    const targetDirectory = path.join(root, "platform");
    const messages: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          confirm: async () => false,
          select: async (message) => {
            messages.push(message);
            return ({ "Agent setup": "none", "Start from": "recommended", "Configure stack": "continue", Review: "install" })[message] ?? "invalid";
          }
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect(messages).toContain("Agent setup");
      expect((await readConfig(targetDirectory)).agents.mode).toBe("none");
      expect(existsSync(path.join(targetDirectory, "AGENTS.md"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts an interactive custom role list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-interactive-"));
    const targetDirectory = path.join(root, "platform");
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async (message) => message === "Agent IDs (comma-separated)" ? "backend,reviewer" : "unused",
          confirm: async () => false,
          select: async (message) => ({ "Agent setup": "custom", "Start from": "recommended", "Configure stack": "continue", Review: "install" })[message] ?? "invalid"
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).agents.enabled).toEqual(["backend@1.0.0", "reviewer@1.0.0"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts an explicit custom agent selection and explains it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-custom-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--agents", "custom", "--agent", "backend,reviewer", "--target", targetDirectory, "--yes"], {
        write: (line) => output.push(line),
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect((await readConfig(targetDirectory)).agents.enabled).toEqual(["backend@1.0.0", "reviewer@1.0.0"]);
      expect(output.join("\n")).toContain("backend: Selected explicitly.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unavailable custom agent without creating a target", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-agent-invalid-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--agents", "custom", "--agent", "missing", "--target", targetDirectory, "--yes"], {
        write: (line) => output.push(line)
      });
      expect(exitCode).toBe(2);
      expect(output.join("\n")).toContain('Agent "missing" is not available for monorepo.');
      expect(existsSync(targetDirectory)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
            if (message === "Agent setup") return "automatic";
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
      expect(selectMessages).toEqual(["Project type", "Agent setup", "Setup", "Frontend", "Install stack"]);
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
