import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";
import { generateMcpCapability } from "../../src/execution/capabilities/mcp-server.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const create = async (projectType: "api" | "monorepo") => {
  const root = await mkdtemp(path.join(os.tmpdir(), "generated-mcp-"));
  roots.push(root);
  const targetDirectory = path.join(root, "sample");
  const plan = await planCreate({
    name: "sample", projectType, targetDirectory, registryRoot: path.resolve("registry"),
    preset: projectType === "api" ? "recommended-api" : "recommended-monorepo",
    stack: {}, capabilities: [{ id: "mcp-server", version: "1.0.0" }], agentMode: "automatic"
  });
  await applyCreatePlan(plan, { run: async () => undefined });
  return targetDirectory;
};

describe("generated MCP server capability", () => {
  it("rejects missing backend output and conflicting package metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "generated-mcp-invalid-"));
    roots.push(root);
    const plan = await planCreate({
      name: "sample", projectType: "api", targetDirectory: path.join(root, "sample"),
      registryRoot: path.resolve("registry"), preset: "recommended-api", stack: {},
      capabilities: [{ id: "mcp-server", version: "1.0.0" }], agentMode: "automatic"
    });
    const target = plan.targetDirectory;
    await mkdir(target);
    const runner = { run: async () => undefined };
    await expect(generateMcpCapability(target, plan.config, runner)).rejects.toThrow("Missing or invalid package metadata");
    await writeFile(path.join(target, "package.json"), '{"scripts":{},"dependencies":{}}');
    await expect(generateMcpCapability(target, plan.config, runner)).rejects.toThrow("generated health service");
    await mkdir(path.join(target, "src"));
    await writeFile(path.join(target, "src/health.ts"), 'export const getHealth = () => ({ status: "ok" });');
    await writeFile(path.join(target, "package.json"), '{"scripts":{"mcp":"echo wrong"},"dependencies":{}}');
    await expect(generateMcpCapability(target, plan.config, runner)).rejects.toThrow("Conflicting package scripts.mcp");
    await writeFile(path.join(target, "package.json"), '{"scripts":{},"dependencies":{}}');
    await mkdir(path.join(target, "src/mcp"));
    const existingServer = path.join(target, "src/mcp/server.ts");
    await writeFile(existingServer, "// project-owned MCP server\n");
    await expect(generateMcpCapability(target, plan.config, runner)).rejects.toThrow("Conflicting MCP server source");
    expect(await readFile(existingServer, "utf8")).toBe("// project-owned MCP server\n");
  });

  it("adds a runnable stdio entry and connection instructions to API", async () => {
    const root = await create("api");
    const source = await readFile(path.join(root, "src/mcp/server.ts"), "utf8");
    expect(source).toContain("serveStdio");
    expect(source).toContain('registerTool("get_health"');
    expect(source).toContain('import { getHealth } from "../health.js"');
    const apiPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(apiPackage.scripts.mcp).toBe("node dist/mcp/server.js");
    expect(apiPackage.dependencies["@modelcontextprotocol/server"]).toBe("^2.1.0");
    const readme = await readFile(path.join(root, "README.md"), "utf8");
    expect(readme).toContain("pnpm build");
    expect(readme).toContain("[mcp_servers.project_app]");
    expect(readme).toContain('args = ["mcp"]');
  });

  it("adds a root command and agent guidance to Monorepo", async () => {
    const root = await create("monorepo");
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(packageJson.scripts.mcp).toBe("pnpm --filter ./apps/api mcp");
    expect(existsSync(path.join(root, "apps/api/src/mcp/server.ts"))).toBe(true);
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("get_health");
    expect(await readFile(path.join(root, "agents/backend.toml"), "utf8")).toContain("get_health");
    expect(await readFile(path.join(root, "agents/reviewer.toml"), "utf8")).toContain("get_health");
  });
});
