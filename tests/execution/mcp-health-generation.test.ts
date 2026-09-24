import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const create = async (projectType: "api" | "monorepo", mcp: boolean, options: { backend?: string; auth?: string } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "generated-health-"));
  roots.push(root);
  const targetDirectory = path.join(root, "sample");
  const plan = await planCreate({
    name: "sample", projectType, targetDirectory, registryRoot: path.resolve("registry"),
    preset: projectType === "api" ? "recommended-api" : "recommended-monorepo",
    stack: options.backend === undefined ? {} : { backend: options.backend },
    capabilities: mcp ? [{ id: "mcp-server", version: "1.0.0" }] : [],
    agentMode: "automatic",
    ...(options.auth === undefined ? {} : { authentication: options.auth })
  });
  await applyCreatePlan(plan, { run: async () => undefined });
  return targetDirectory;
};

describe("generated shared health", () => {
  it("gives a Fastify API one health function for HTTP and MCP", async () => {
    const root = await create("api", true, { backend: "fastify@5.0.0" });
    expect(await readFile(path.join(root, "src/health.ts"), "utf8")).toContain("export const getHealth");
    const app = await readFile(path.join(root, "src/app.ts"), "utf8");
    expect(app).toContain('import { getHealth } from "./health.js"');
    expect(app).toContain('app.get("/health", async () => getHealth())');
  });

  it.each(["custom", "clerk"])("keeps %s auth routes while sharing health in legacy Monorepo", async (auth) => {
    const root = await create("monorepo", true, { auth });
    expect(await readFile(path.join(root, "apps/api/src/health.ts"), "utf8")).toContain("export const getHealth");
    const server = await readFile(path.join(root, "apps/api/src/server.ts"), "utf8");
    expect(server).toContain('import { getHealth } from "./health.js"');
    expect(server).toContain("response.json(getHealth())");
    const authRoutes = auth === "custom"
      ? await readFile(path.join(root, "apps/api/src/auth/router.ts"), "utf8")
      : server;
    expect(authRoutes).toContain(auth === "custom" ? 'authRouter.get("/me"' : 'app.get("/auth/me"');
  });

  it("does not add a health module when MCP is off", async () => {
    const root = await create("api", false);
    expect(existsSync(path.join(root, "src/health.ts"))).toBe(false);
  });
});
