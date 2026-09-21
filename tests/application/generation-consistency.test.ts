import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";
import { generateCreateScaffold } from "../../src/execution/legacy-create-generator.js";

const roots: string[] = [];
const input = async (projectType = "monorepo", stack: Record<string, string> = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "generation-contract-"));
  roots.push(root);
  return { name: "demo", projectType, stack, targetDirectory: path.join(root, "demo"), registryRoot: path.resolve("registry"), capabilities: [], agentMode: "automatic" as const };
};
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("selection / generator consistency", () => {
  it.each([
    { "frontend-framework": "nextjs@15" },
    { "backend-framework": "nestjs@11" },
    { packageManager: "npm@10" },
    { workspace: "npm-workspaces@10" },
    { "frontend-library": "vue@3" },
    { orm: "drizzle@0.45" },
    { database: "mysql@8" },
    { "frontend-framework": "vite@99" },
    { unrecognized: "anything@1" }
  ])("rejects legacy selections that the scaffold cannot honor: %j", async (stack) => {
    const request = await input("monorepo", stack);
    await expect(planCreate(request)).rejects.toThrow(/unsupported|not implemented/i);
    expect(existsSync(request.targetDirectory)).toBe(false);
  });

  it("rejects the reported Next.js / NestJS / npm combination", async () => {
    const request = await input("monorepo", { "frontend-framework": "nextjs@15", "backend-framework": "nestjs@11", packageManager: "npm@10" });
    await expect(planCreate(request)).rejects.toThrow(/unsupported/i);
    expect(existsSync(request.targetDirectory)).toBe(false);
  });

  it.each([
    { frontend: "vue@3.0.0", backend: "fastify@5.0.0", orm: "drizzle@0.45.0", packageManager: "npm@10" },
    { frontend: "vue@3.0.0", "frontend-library": "react@19" },
    { backend: "fastify@5.0.0", "backend-framework": "express@5" },
    { frontend: "react@999.0.0" },
    { frontend: "react@19.0.0", testing: "vitest@4" }
  ])("does not allow Custom dispatch to bypass validation: %j", async (stack) => {
    const request = await input("monorepo", stack);
    await expect(planCreate(request)).rejects.toThrow(/unsupported|conflict/i);
    expect(existsSync(request.targetDirectory)).toBe(false);
  });

  it.each(["apply", "direct"])("validates again before writes when called through %s", async (entry) => {
    const request = await input();
    const plan = await planCreate(request);
    const config = { ...plan.config, composition: { ...plan.config.composition, stack: { packageManager: "npm@10" } } };
    const runner = { run: async () => { throw new Error("Must fail before launching subprocesses"); } };
    const operation = entry === "apply"
      ? applyCreatePlan({ ...plan, config }, runner)
      : generateCreateScaffold(request.targetDirectory, config, runner);
    await expect(operation).rejects.toThrow(/unsupported/i);
    expect(existsSync(request.targetDirectory)).toBe(false);
  });

  it.each(["recommended-cli", "recommended-library"])("rejects a preset with no implemented generator: %s", async (preset) => {
    const request = await input(preset.replace("recommended-", ""));
    await expect(planCreate({ ...request, preset })).rejects.toThrow(/not implemented|unsupported/i);
    expect(existsSync(request.targetDirectory)).toBe(false);
  });
});
