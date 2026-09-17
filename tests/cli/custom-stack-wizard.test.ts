import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";

describe("custom stack wizard", () => {
  it("walks Monorepo stack slots from Registry and previews the resolved stack before install", async () => {
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
            if (message === "Workspace") {
              expect(names).toEqual(["pnpm Workspaces"]);
              return "pnpm-workspaces";
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
            if (message === "Language") {
              expect(names).toEqual(["TypeScript"]);
              return "typescript";
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
            if (message === "Install stack") {
              expect(names).toEqual(["Install"]);
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
        "Workspace",
        "Frontend framework",
        "Frontend library",
        "Backend framework",
        "Language",
        "Testing",
        "Authentication",
        "Agents",
        "Install stack"
      ]);

      const rendered = output.join("\n");
      expect(rendered).toContain("Custom Monorepo");
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
});
