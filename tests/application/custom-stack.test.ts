import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";

describe("Custom generated stacks", () => {
  it("rejects an unknown component before creating the target", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "custom-unsupported-"));
    const target = path.join(root, "demo");
    try {
      await expect(planCreate({ name: "demo", projectType: "web", targetDirectory: target,
        registryRoot: path.resolve("registry"), stack: { frontend: "svelte@5.0.0" }, capabilities: [], agentMode: "automatic" })).rejects.toThrow("Unsupported frontend");
      expect(existsSync(target)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("generates the supported Recommended API stack", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legacy-preset-"));
    const target = path.join(root, "demo");
    try {
      const plan = await planCreate({ name: "demo", projectType: "api", targetDirectory: target,
        registryRoot: path.resolve("registry"), preset: "recommended-api", stack: {}, capabilities: [], agentMode: "automatic" });
      await applyCreatePlan(plan, { run: async () => undefined });
      const api = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"));
      expect(api.dependencies.express).toBeTruthy();
      expect(api.dependencies["@prisma/client"]).toBeTruthy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ["react", "express", "prisma", "custom"],
    ["vue", "fastify", "drizzle", "custom"],
    ["vue", "express", "prisma", "clerk"],
    ["react", "fastify", "drizzle", "clerk"]
  ])("generates %s / %s / %s with %s auth", async (frontend, backend, orm, authentication) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "custom-stack-"));
    const target = path.join(root, "demo");
    try {
      const plan = await planCreate({ name: "demo", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"), stack: { frontend: `${frontend}@${frontend === "vue" ? "3.0.0" : "19.0.0"}`, backend: `${backend}@5.0.0`, orm: `${orm}@${orm === "prisma" ? "6.0.0" : "0.45.0"}` },
        capabilities: [], authentication, agentMode: "automatic" });
      const commands: string[][] = [];
      await applyCreatePlan(plan, { run: async (command, args) => { commands.push([command, ...args]); } });
      const api = JSON.parse(await readFile(path.join(target, "apps/api/package.json"), "utf8"));
      const web = JSON.parse(await readFile(path.join(target, "apps/web/package.json"), "utf8"));
      expect(web.dependencies[frontend!]).toBeTruthy();
      expect(web.dependencies[frontend === "vue" ? "react" : "vue"]).toBeUndefined();
      expect(api.dependencies[backend!]).toBeTruthy();
      expect(api.dependencies[backend === "fastify" ? "express" : "fastify"]).toBeUndefined();
      expect(api.dependencies[orm === "drizzle" ? "drizzle-orm" : "@prisma/client"]).toBeTruthy();
      expect(api.dependencies[orm === "drizzle" ? "@prisma/client" : "drizzle-orm"]).toBeUndefined();
      expect(existsSync(path.join(target, "apps/web/src", frontend === "vue" ? "App.vue" : "App.tsx"))).toBe(true);
      expect(commands.some((args) => args.includes("generate") && args.includes("prisma"))).toBe(orm === "prisma");
      expect(existsSync(path.join(target, "README.md"))).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
