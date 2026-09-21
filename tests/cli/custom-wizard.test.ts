import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { runCli } from "../../src/cli/main.js";

describe("Custom stack wizard", () => {
  it.each([false, true])("persists choices and previews them before installation (from recommended: %s)", async (fromRecommended) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "custom-wizard-"));
    const target = path.join(root, "demo");
    const output: string[] = [];
    const prompts: string[] = [];
    let approvals = 0;
    try {
      const code = await runCli(["create", "demo", "--type", "monorepo", "--target", target], {
        write: (line) => output.push(line),
        generatorRunner: { run: async () => undefined },
        prompt: {
          input: async () => "unused",
          confirm: async () => { throw new Error("Use the installation menu"); },
          select: async (message, choices) => {
            prompts.push(message);
            if (message === "Setup") return fromRecommended ? "recommended" : "custom";
            if (message === "Frontend") {
              expect(choices.map((choice) => choice.value)).toEqual(["react", "vue"]);
              return "vue";
            }
            if (message === "Backend") return "fastify";
            if (message === "ORM") return "drizzle";
            if (message === "Authentication") return "custom";
            if (message === "Install stack") {
              if (fromRecommended && approvals++ === 0) return "custom";
              expect(existsSync(target)).toBe(false);
              expect(output.join("\n")).toContain("Frontend: Vue");
              expect(output.join("\n")).toContain("Backend: Fastify");
              expect(output.join("\n")).toContain("ORM: Drizzle");
              return "install";
            }
            throw new Error(`Unexpected question: ${message}`);
          }
        }
      });
      expect(code).toBe(0);
      expect(prompts).toEqual(expect.arrayContaining(["Frontend", "Backend", "ORM", "Install stack"]));
      const config = parse(await readFile(path.join(target, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBeUndefined();
      expect(config.composition.stack).toMatchObject({ frontend: "vue@3.0.0", backend: "fastify@5.0.0", orm: "drizzle@0.45.0" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each(["Frontend", "Backend", "ORM", "Install stack"])("does not create files for invalid %s selection", async (invalidStep) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "custom-invalid-"));
    const target = path.join(root, "demo");
    try {
      const code = await runCli(["create", "demo", "--type", "monorepo", "--target", target], {
        write: () => undefined,
        generatorRunner: { run: async () => { throw new Error("Must not generate"); } },
        prompt: {
          input: async () => "unused", confirm: async () => false,
          select: async (message) => message === invalidStep ? "invalid" : ({ Setup: "custom", Frontend: "react", Backend: "express", ORM: "prisma", Authentication: "custom" }[message] ?? "install")
        }
      });
      expect(code).toBe(2);
      expect(existsSync(target)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ["web", ["Setup", "Frontend", "Install stack"]],
    ["api", ["Setup", "Backend", "ORM", "Install stack"]]
  ] as const)("only offers relevant categories for %s", async (type, expectedQuestions) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "custom-categories-"));
    const target = path.join(root, "demo");
    const questions: string[] = [];
    try {
      const code = await runCli(["create", "demo", "--type", type, "--target", target], {
        write: () => undefined, generatorRunner: { run: async () => undefined },
        prompt: {
          input: async () => "unused", confirm: async () => false,
          select: async (message) => {
            questions.push(message);
            return ({ Setup: "custom", Frontend: "vue", Backend: "fastify", ORM: "drizzle", "Install stack": "install" })[message] ?? "invalid";
          }
        }
      });
      expect(code).toBe(0);
      expect(questions).toEqual(expectedQuestions);
      const pkg = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"));
      expect(pkg.dependencies[type === "web" ? "vue" : "fastify"]).toBeTruthy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("honors NO_COLOR even if the caller enables color", async () => {
    vi.stubEnv("NO_COLOR", "");
    const output: string[] = [];
    try {
      const code = await runCli(["create", "demo", "--type", "web"], {
        color: true, write: (line) => output.push(line),
        prompt: { input: async () => "unused", confirm: async () => false, select: async () => "invalid" }
      });
      expect(code).toBe(2);
      expect(output.join("\n")).not.toContain("\u001b[");
    } finally { vi.unstubAllEnvs(); }
  });
});
