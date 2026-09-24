import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";

const execute = promisify(execFile);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const createAndBuild = async (projectType: "api" | "monorepo", options: { backend?: string; auth?: string } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plugin-core-mcp-e2e-"));
  roots.push(root);
  const targetDirectory = path.join(root, "sample");
  const plan = await planCreate({
    name: "sample", projectType, targetDirectory, registryRoot: path.resolve("registry"),
    preset: projectType === "api" ? "recommended-api" : "recommended-monorepo",
    stack: options.backend === undefined ? {} : { backend: options.backend },
    capabilities: [{ id: "mcp-server", version: "1.0.0" }], agentMode: "automatic",
    ...(options.auth === undefined ? {} : { authentication: options.auth })
  });
  await applyCreatePlan(plan);
  try {
    await execute(pnpm, ["build"], { cwd: targetDirectory, timeout: 240000 });
  } catch (error) {
    const detail = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`Generated build failed:\n${detail.stdout ?? ""}\n${detail.stderr ?? ""}`, { cause: error });
  }
  return targetDirectory;
};

const callHealth = async (cwd: string) => {
  const client = new Client({ name: "plugin-core-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: pnpm, args: ["mcp"], cwd });
  await client.connect(transport);
  try {
    expect((await client.listTools()).tools.map(({ name }) => name)).toContain("get_health");
    const response = await client.callTool({ name: "get_health", arguments: {} });
    expect(response.isError).not.toBe(true);
    expect(response.content).toContainEqual({ type: "text", text: '{"status":"ok"}' });
  } finally {
    await client.close();
  }
};

describe("generated MCP process", () => {
  it("builds and connects to a recommended API", async () => {
    const root = await createAndBuild("api");
    await callHealth(root);
  }, 600000);

  it("builds and connects to a recommended Monorepo", async () => {
    const root = await createAndBuild("monorepo");
    await callHealth(root);
  }, 600000);

  it("builds a Fastify API and a Clerk Monorepo with MCP", async () => {
    const fastify = await createAndBuild("api", { backend: "fastify@5.0.0" });
    await callHealth(fastify);
    const clerk = await createAndBuild("monorepo", { auth: "clerk" });
    expect(await readFile(path.join(clerk, "apps/api/src/server.ts"), "utf8")).toContain("/auth/me");
    await callHealth(clerk);
  }, 600000);
});
