import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";

describe("recommended create wizard", () => {
  it("uses Project type -> Setup -> preview -> Continue for a recommended composition", async () => {
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

            if (message === "Continue") {
              expect(choices.map((choice) => choice.name)).toEqual(["Yes", "Customize"]);
              return "yes";
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
      expect(selectMessages).toEqual(["Project type", "Setup", "Continue"]);
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

  it("keeps the recommended preset when Customize overrides authentication", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-customize-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    let continueSelections = 0;

    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            if (message === "Project type") return "monorepo";
            if (message === "Setup") return "recommended";

            if (message === "Continue") {
              continueSelections += 1;
              return continueSelections === 1 ? "customize" : "yes";
            }

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
      expect(continueSelections).toBe(2);
      expect(output.join("\n")).toContain("Authentication: Clerk Authentication");

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
      expect(config.composition.authentication).toBe("clerk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
