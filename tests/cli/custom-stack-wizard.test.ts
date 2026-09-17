import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";

describe("custom stack wizard", () => {
  it("auto-selects single choices and previews the resolved stack before installation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-stack-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    const prompts: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            prompts.push(message);
            const names = choices.map((choice) => choice.name);

            if (message === "Project type") return "monorepo";
            if (message === "Setup") return "custom";
            if (message === "Workspace" || message === "Language") {
              throw new Error(`${message} must be auto-selected when only one choice is available`);
            }
            if (message === "Frontend framework") {
              expect(names).toEqual(["Vite", "None"]);
              expect(names).not.toContain("Next.js");
              return "vite";
            }
            if (message === "Frontend library") {
              expect(names).toEqual(["React", "None"]);
              return "react";
            }
            if (message === "Backend framework") {
              expect(names).toEqual(["Express", "None"]);
              expect(names).not.toContain("NestJS");
              return "express";
            }
            if (message === "Testing") {
              expect(names).toEqual(["Vitest", "None"]);
              return "vitest";
            }
            if (message === "Authentication") {
              expect(names).toEqual(["Custom Authentication", "Clerk Authentication", "None"]);
              return "none";
            }
            if (message === "Agents") {
              expect(names).toEqual(["Automatic", "None"]);
              return "none";
            }
            if (message === "Install this stack?") {
              expect(names).toEqual(["Install", "Edit selections", "Cancel"]);
              return "install";
            }

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => { throw new Error("confirm must not be used by the create wizard"); }
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(prompts).toEqual([
        "Project type",
        "Setup",
        "Frontend framework",
        "Frontend library",
        "Backend framework",
        "Testing",
        "Authentication",
        "Agents",
        "Install this stack?"
      ]);

      const rendered = output.join("\n");
      expect(rendered).toContain("Custom Monorepo");
      expect(rendered).toContain("Auto-selected Workspace: pnpm Workspaces");
      expect(rendered).toContain("Auto-selected Language: TypeScript");
      expect(rendered).toContain("Workspace: pnpm Workspaces");
      expect(rendered).toContain("Frontend framework: Vite");
      expect(rendered).toContain("Frontend library: React");
      expect(rendered).toContain("Backend framework: Express");
      expect(rendered).toContain("Language: TypeScript");
      expect(rendered).toContain("Testing: Vitest");
      expect(rendered).toContain("Authentication: None");
      expect(rendered).toContain("Agents: None");
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBeUndefined();
      expect(config.composition.stack).toEqual({
        workspace: "pnpm-workspaces@10.0.0",
        "frontend-framework": "vite@8.0.0",
        "frontend-library": "react@19.0.0",
        "backend-framework": "express@5.0.0",
        language: "typescript@5.0.0",
        testing: "vitest@4.0.0"
      });
      expect(config.composition.authentication).toBeUndefined();
      expect(config.agents.mode).toBe("none");
      expect(config.agents.enabled).toEqual([]);
      expect(config.agents.adapters).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-prompts a choice when the prompt returns an invalid selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-invalid-choice-"));
    const targetDirectory = path.join(root, "platform");
    let frontendAttempts = 0;

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Setup") return "custom";
            if (message === "Frontend framework") {
              frontendAttempts += 1;
              return frontendAttempts === 1 ? "" : "vite";
            }
            if (message === "Frontend library") return "react";
            if (message === "Backend framework") return "express";
            if (message === "Testing") return "vitest";
            if (message === "Authentication") return "none";
            if (message === "Agents") return "automatic";
            if (message === "Install this stack?") return "cancel";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => { throw new Error("Generator must not run after cancellation."); } }
      } as never);

      expect(frontendAttempts).toBe(2);
      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets the user edit selections before installing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-custom-edit-"));
    const targetDirectory = path.join(root, "platform");
    let pass = 0;

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Setup") return "custom";
            if (message === "Frontend framework") return pass === 0 ? "none" : "vite";
            if (message === "Frontend library") return pass === 0 ? "none" : "react";
            if (message === "Backend framework") return "express";
            if (message === "Testing") return "vitest";
            if (message === "Authentication") return "none";
            if (message === "Agents") return "automatic";
            if (message === "Install this stack?") {
              if (pass === 0) {
                pass = 1;
                return "edit";
              }
              return "install";
            }
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.stack["frontend-framework"]).toBe("vite@8.0.0");
      expect(config.composition.stack["frontend-library"]).toBe("react@19.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
