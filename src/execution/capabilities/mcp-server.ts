import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RepoConfig } from "../../core/config/repo-config.js";
import { RepositoryStandardError } from "../../core/errors.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";
import type { GeneratorRunner } from "../generator-runner.js";
import { hasMcpCapability } from "./mcp-selection.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (message: string): RepositoryStandardError =>
  new RepositoryStandardError("CONFIG_INVALID", message);

const readPackage = async (file: string): Promise<Record<string, unknown>> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Missing or invalid package metadata: ${file}.`, { cause: error });
  }
  if (!isRecord(parsed)) throw invalid(`Package metadata must be an object: ${file}.`);
  return parsed;
};

const setField = (parent: Record<string, unknown>, section: string, key: string, value: string): void => {
  const current = parent[section];
  if (current !== undefined && !isRecord(current)) throw invalid(`Invalid package ${section} section.`);
  const fields = current ?? {};
  if (!isRecord(fields)) throw invalid(`Invalid package ${section} section.`);
  if (fields[key] !== undefined && fields[key] !== value) throw invalid(`Conflicting package ${section}.${key}.`);
  fields[key] = value;
  parent[section] = fields;
};

const source = `import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";
import { getHealth } from "../health.js";

// Register additional project tools here. Keep protocol stdout free of logs.
serveStdio(() => {
  const server = new McpServer({ name: "project-app", version: "1.0.0" });
  server.registerTool("get_health", {
    description: "Read application health status",
    inputSchema: z.object({})
  }, async () => ({ content: [{ type: "text", text: JSON.stringify(getHealth()) }] }));
  return server;
});
`;

const readOptional = async (file: string): Promise<string> => {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return "";
    throw error;
  }
};

export const generateMcpCapability = async (
  targetDirectory: string,
  config: RepoConfig,
  runner: GeneratorRunner
): Promise<GenerationResult> => {
  if (!hasMcpCapability(config) || !["api", "monorepo"].includes(config.project.type)) {
    throw invalid("MCP capability requires an API or Monorepo project with mcp-server selected.");
  }
  const monorepo = config.project.type === "monorepo";
  const backend = monorepo ? path.join(targetDirectory, "apps/api") : targetDirectory;
  const backendPackageFile = path.join(backend, "package.json");
  const healthFile = path.join(backend, "src/health.ts");
  const serverFile = path.join(backend, "src/mcp/server.ts");
  const rootPackageFile = path.join(targetDirectory, "package.json");
  const readmeFile = path.join(targetDirectory, "README.md");

  const backendPackage = await readPackage(backendPackageFile);
  try {
    await access(healthFile);
  } catch (error) {
    throw new RepositoryStandardError("CONFIG_INVALID", `MCP requires the generated health service: ${healthFile}.`, { cause: error });
  }
  const rootPackage = monorepo ? await readPackage(rootPackageFile) : backendPackage;
  const serverExists = await lstat(serverFile).then(() => true, (error: unknown) => {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  });
  if (serverExists) throw invalid(`Conflicting MCP server source: ${serverFile}.`);
  setField(backendPackage, "scripts", "mcp", "node dist/mcp/server.js");
  setField(backendPackage, "dependencies", "@modelcontextprotocol/server", "^2.1.0");
  setField(backendPackage, "dependencies", "zod", "^4.6.5");
  if (monorepo) setField(rootPackage, "scripts", "mcp", "pnpm --filter ./apps/api mcp");

  await mkdir(path.dirname(serverFile), { recursive: true });
  await writeFile(serverFile, source, "utf8");
  await writeFile(backendPackageFile, `${JSON.stringify(backendPackage, null, 2)}\n`, "utf8");
  if (monorepo) await writeFile(rootPackageFile, `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8");

  const readme = await readOptional(readmeFile);
  const instructions = `\n## Local MCP server\n\nRun \`pnpm build\` before connecting an MCP host. The host starts the generated server with \`pnpm mcp\` from this project's root. The read-only \`get_health\` tool returns the same status as HTTP GET /health; the HTTP server does not need to run.\n\nAdd this to your Codex \`config.toml\`, replacing the cwd with this project's absolute path:\n\n\`\`\`toml\n[mcp_servers.project_app]\ncommand = "pnpm"\nargs = ["mcp"]\ncwd = "/absolute/path/to/generated-project"\n\`\`\`\n\nAdd application tools in \`${monorepo ? "apps/api/" : ""}src/mcp/server.ts\`. Keep diagnostic output on stderr so stdout contains only MCP protocol messages.\n`;
  await writeFile(readmeFile, `${readme || `# ${config.project.name}\n`}${instructions}`, "utf8");

  const files = [path.relative(targetDirectory, serverFile), path.relative(targetDirectory, backendPackageFile), "README.md"];
  if (monorepo) {
    files.push("package.json");
    const guidance: Record<string, string> = {
      "AGENTS.md": "\nThe backend exposes a local MCP `get_health` tool after `pnpm build` and host connection. Backend and reviewer agents can use it to check the health contract.\n",
      "agents/backend.toml": "\nmcp_guidance = \"After the host connects to the local MCP server, use get_health to check the backend health contract.\"\n",
      "agents/reviewer.toml": "\nmcp_guidance = \"After the host connects to the local MCP server, use get_health to review the backend health contract.\"\n"
    };
    for (const [relative, addition] of Object.entries(guidance)) {
      const file = path.join(targetDirectory, relative);
      await writeFile(file, `${await readOptional(file)}${addition}`, "utf8");
      files.push(relative);
    }
  }

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await runner.run(pnpm, ["install"], targetDirectory);
  if (!monorepo && config.composition.stack.orm?.startsWith("prisma@")) {
    await runner.run(pnpm, ["exec", "prisma", "generate"], targetDirectory);
  }
  const lockfile = path.join(targetDirectory, "pnpm-lock.yaml");
  try {
    await access(lockfile);
    files.push("pnpm-lock.yaml");
  } catch { /* A stub runner need not create a lockfile. */ }
  return { files: files.map((file) => file.split(path.sep).join("/")) };
};
