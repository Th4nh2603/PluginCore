import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";
import { generateCreateScaffold } from "../../src/execution/legacy-create-generator.js";

describe("authentication capability generation", () => {
  it.each([
    ["recommended-monorepo", {}, "apps/api/prisma/schema.prisma", "apps/api/src/auth/router.ts", "apps/web/src/auth/LoginPage.tsx"],
    [undefined, { frontend: "vue@3.0.0", backend: "fastify@5.0.0", orm: "drizzle@0.45.0" }, "apps/api/src/db/schema.ts", "apps/api/src/auth/service.ts", "apps/web/src/App.vue"]
  ])("generates username authentication for %s stack", async (preset, stack, schemaPath, authPath, webPath) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-username-"));
    const target = path.join(root, "platform");
    try {
      const plan = await planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"), stack, capabilities: [], agentMode: "none",
        ...(preset === undefined ? {} : { preset }), authentication: "custom"
      });
      await applyCreatePlan(plan, { run: async () => undefined });
      const schema = await readFile(path.join(target, schemaPath), "utf8");
      const auth = await readFile(path.join(target, authPath), "utf8");
      const web = await readFile(path.join(target, webPath), "utf8");
      expect(schema).toContain("username");
      expect(schema).not.toContain("email");
      expect(auth).toContain("username");
      expect(auth).not.toContain("email");
      expect(web).toContain("Username");
      expect(web).not.toContain("Email");
      const server = await readFile(path.join(target, preset === undefined ? "apps/api/src/app.ts" : "apps/api/src/server.ts"), "utf8");
      expect(server).not.toMatch(/(?:console|log)\.error\(error\)/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("rejects a registered authentication capability with no executor before creating files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-capability-unsupported-"));
    const registryRoot = path.join(root, "registry");
    const target = path.join(root, "platform");
    try {
      await cp(path.resolve("registry"), registryRoot, { recursive: true });
      const capabilityDirectory = path.join(registryRoot, "capabilities", "auth-firebase");
      await mkdir(capabilityDirectory, { recursive: true });
      await writeFile(path.join(capabilityDirectory, "manifest.yaml"),
        "schemaVersion: 1\nid: auth-firebase\nkind: capability\nversion: 1.0.0\ndisplayName: Firebase Authentication\ncompatibility: { projectTypes: [monorepo] }\n");

      await expect(planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot, preset: "recommended-monorepo", stack: {}, capabilities: [],
        agentMode: "automatic", authentication: "firebase"
      })).rejects.toThrow('No authentication executor is available for "auth-firebase".');
      expect(existsSync(target)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("generates authentication only when the capability operation runs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-operation-"));
    const target = path.join(root, "platform");
    try {
      const plan = await planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"), preset: "recommended-monorepo",
        stack: {}, capabilities: [], agentMode: "automatic"
      });
      const withoutAuthentication = {
        ...plan,
        executionPlan: {
          ...plan.executionPlan,
          operations: plan.executionPlan.operations.filter((operation) =>
            operation.type !== "generate" || operation.extension.kind !== "capability"
          )
        }
      };

      await applyCreatePlan(withoutAuthentication, { run: async () => undefined });

      expect(existsSync(path.join(target, "apps/api/src/auth/router.ts"))).toBe(false);
      expect(existsSync(path.join(target, "apps/web/src/auth/api.ts"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects two authentication capabilities before creating the target", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-capability-conflict-"));
    const target = path.join(root, "platform");
    try {
      await expect(planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"), preset: "recommended-monorepo",
        stack: {}, capabilities: [
          { id: "auth-custom", version: "1.0.0" },
          { id: "auth-clerk", version: "1.0.0" }
        ], agentMode: "automatic"
      })).rejects.toThrow("Select exactly one authentication capability");
      expect(existsSync(target)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps Custom authentication as the default for an unselected Custom Monorepo", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-capability-default-"));
    const target = path.join(root, "platform");
    try {
      const plan = await planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"),
        stack: { frontend: "react@19.0.0", backend: "express@5.0.0", orm: "prisma@6.0.0" },
        capabilities: [], agentMode: "automatic"
      });

      expect(plan.config.composition.capabilities).toEqual([{ id: "auth-custom", version: "1.0.0" }]);
      expect(plan.config.composition.authentication).toBe("custom");

      await generateCreateScaffold(target, plan.config, { run: async () => undefined });

      expect(await readFile(path.join(target, "apps/api/src/auth/service.ts"), "utf8")).toContain("jwtVerify");
      expect(await readFile(path.join(target, "apps/api/.env.example"), "utf8")).toContain("JWT_SECRET");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["recommended-monorepo", {}, "apps/web/src/App.tsx"],
    [undefined, { frontend: "vue@3.0.0", backend: "fastify@5.0.0", orm: "drizzle@0.45.0" }, "apps/web/src/App.vue"]
  ])("uses the selected Clerk capability for %s stack", async (preset, stack, appPath) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "auth-capability-"));
    const target = path.join(root, "platform");
    try {
      const plan = await planCreate({
        name: "platform", projectType: "monorepo", targetDirectory: target,
        registryRoot: path.resolve("registry"), stack, capabilities: [], agentMode: "automatic",
        ...(preset === undefined ? {} : { preset }), authentication: "clerk"
      });
      const config = { ...plan.config, composition: { ...plan.config.composition, authentication: "custom" } };

      await generateCreateScaffold(target, config, { run: async () => undefined });

      expect(await readFile(path.join(target, appPath), "utf8")).toContain("@clerk/");
      expect(existsSync(path.join(target, "apps/api/src/auth/router.ts"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
