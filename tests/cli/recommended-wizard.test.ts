import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";

describe("recommended create wizard", () => {
  it("shows the recommended stack before the user approves installation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    const selectMessages: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            selectMessages.push(message);

            if (message === "Project type") {
              expect(choices.find((choice) => choice.value === "monorepo")?.name).toBe("Monorepo");
              return "monorepo";
            }

            if (message === "Setup") {
              expect(choices.map((choice) => choice.name)).toEqual(["★ Recommended", "Custom"]);
              return "recommended";
            }

            if (message === "Stack setup") {
              expect(choices.map((choice) => choice.name)).toEqual(["Install Recommended stack", "Customize stack"]);
              return "install";
            }

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => {
            throw new Error("The recommended wizard must use selections instead of a yes/no confirmation.");
          }
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(selectMessages).toEqual(["Project type", "Setup", "Stack setup"]);
      expect(output.join("\n")).toContain("Recommended Monorepo");
      expect(output.join("\n")).toContain("Frontend: Vite + React");
      expect(output.join("\n")).toContain("Authentication: Custom Authentication");
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
      expect(config.composition.authentication).toBe("custom");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects authentication during Custom Monorepo setup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-customize-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            if (message === "Project type") return "monorepo";
            if (message === "Setup") return "custom";
            if (message === "Workspace" || message === "Language") {
              throw new Error(`${message} must be auto-selected`);
            }
            if (message === "Frontend framework") return "vite";
            if (message === "Frontend library") return "react";
            if (message === "Backend framework") return "express";
            if (message === "Testing") return "vitest";

            if (message === "Authentication") {
              expect(choices.map((choice) => choice.name)).toEqual([
                "Custom Authentication",
                "Clerk Authentication",
                "None"
              ]);
              return "clerk";
            }

            if (message === "Agents") return "automatic";
            if (message === "Install this stack?") return "install";

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBeUndefined();
      expect(config.composition.authentication).toBe("clerk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-prompts an invalid recommended stack decision instead of continuing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-invalid-"));
    const targetDirectory = path.join(root, "platform");
    let stackSetupAttempts = 0;

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          select: async (message: string) => {
            if (message === "Setup") return "recommended";
            if (message === "Stack setup") {
              stackSetupAttempts += 1;
              return stackSetupAttempts === 1 ? "" : "custom";
            }
            if (message === "Frontend framework") return "none";
            if (message === "Frontend library") return "none";
            if (message === "Backend framework") return "none";
            if (message === "Testing") return "none";
            if (message === "Authentication") return "none";
            if (message === "Agents") return "none";
            if (message === "Install this stack?") return "cancel";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => { throw new Error("Generator must not run after cancellation."); } }
      } as never);

      expect(stackSetupAttempts).toBe(2);
      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
