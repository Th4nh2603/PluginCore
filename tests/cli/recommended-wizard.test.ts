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

            if (message === "Recommended preset") {
              expect(choices.map((choice) => choice.value)).toEqual(["recommended-monorepo"]);
              return "recommended-monorepo";
            }

            if (message === "Install stack") {
              expect(choices.map((choice) => choice.name)).toEqual(["Install", "Choose Custom setup"]);
              return "install";
            }

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => {
            throw new Error("The recommended wizard must use the Continue selection instead of a yes/no confirmation.");
          }
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(selectMessages).toEqual(["Project type", "Setup", "Recommended preset", "Install stack"]);
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
            if (message === "Frontend") return "react";
            if (message === "Backend") return "express";
            if (message === "ORM") return "prisma";
            if (message === "Install stack") return "install";

            if (message === "Authentication") {
              expect(choices.map((choice) => choice.name)).toEqual([
                "Custom Authentication",
                "Clerk Authentication"
              ]);
              return "clerk";
            }

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

  it("does not install a recommended stack after an invalid approval selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-invalid-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => ({ Setup: "recommended", "Recommended preset": "recommended-monorepo" }[message] ?? ""),
          confirm: async () => false
        },
        generatorRunner: { run: async () => { throw new Error("Generator must not run without approval."); } }
      } as never);

      expect(exitCode).toBe(2);
      expect(output.join("\n")).toContain("Choose Install or Choose Custom setup.");
      expect(existsSync(targetDirectory)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
