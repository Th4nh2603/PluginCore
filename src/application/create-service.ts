import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";
import { createManagedState, writeYamlAtomically } from "./project-state.js";
import { defaultGeneratorRunner, type GeneratorRunner } from "./generator-runner.js";
import { stringify } from "yaml";

export interface CreateInput {
  readonly name: string;
  readonly targetDirectory: string;
  readonly registryRoot: string;
  readonly projectType: string;
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly capabilities: readonly { readonly id: string; readonly version: string; readonly configRef?: string }[];
  readonly agentMode: RepoConfig["agents"]["mode"];
}

export interface CreatePlan {
  readonly targetDirectory: string;
  readonly config: RepoConfig;
  readonly operations: readonly ("write-config" | "write-managed-state")[];
  readonly preview: string;
}

const validName = /^[a-z0-9][a-z0-9-]*$/i;

const writeMonorepoScaffold = async (targetDirectory: string, name: string): Promise<void> => {
  const packageScope = `@${name}`;
  const files: Readonly<Record<string, string>> = {
    "package.json": `${JSON.stringify({
      name,
      private: true,
      scripts: {
        dev: "pnpm --parallel --filter ./apps/web --filter ./apps/api dev",
        "dev:web": "pnpm --filter ./apps/web dev",
        "dev:api": "pnpm --filter ./apps/api dev",
        build: "pnpm -r build",
        test: "pnpm -r test"
      }
    }, null, 2)}\n`,
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true } }, null, 2)}\n`,
    "apps/api/package.json": `${JSON.stringify({
      name: `${packageScope}/api`, private: true, type: "module",
      scripts: { dev: "tsx watch src/server.ts", build: "tsc -p tsconfig.json", start: "node dist/server.js", test: "vitest run" },
      dependencies: { [`${packageScope}/shared`]: "workspace:*", express: "^5.1.0" },
      devDependencies: { "@types/express": "^5.0.1", tsx: "^4.20.5", typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "apps/api/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src"] }, null, 2)}\n`,
    "apps/api/src/server.ts": "import express from \"express\";\n\nconst app = express();\nconst port = Number(process.env.PORT ?? 3001);\n\napp.get(\"/health\", (_request, response) => response.json({ status: \"ok\" }));\n\napp.listen(port, () => console.log(`API listening on http://localhost:${port}`));\n",
    "packages/shared/package.json": `${JSON.stringify({
      name: `${packageScope}/shared`, private: true, type: "module",
      exports: "./dist/index.js", types: "./dist/index.d.ts",
      scripts: { build: "tsc -p tsconfig.json", test: "vitest run" },
      devDependencies: { typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "packages/shared/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist", declaration: true }, include: ["src"] }, null, 2)}\n`,
    "packages/shared/src/index.ts": "export const serviceName = \"shared\";\n"
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};

export const planCreate = async (input: CreateInput): Promise<CreatePlan> => {
  if (!validName.test(input.name)) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Project name must use letters, numbers, and hyphens.");
  }

  const targetDirectory = path.resolve(input.targetDirectory);
  if (existsSync(targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${targetDirectory}.`);
  }

  const registry = await loadRegistry(input.registryRoot);
  if (registry.get("project-type", input.projectType) === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Project type "${input.projectType}" is not available.`);
  }

  const preset = input.preset === undefined ? undefined : registry.get("preset", input.preset);
  if (input.preset !== undefined && preset === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Preset "${input.preset}" is not available.`);
  }
  const supportedProjectTypes = preset?.compatibility?.projectTypes;
  if (Array.isArray(supportedProjectTypes) && !supportedProjectTypes.includes(input.projectType)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Preset "${input.preset}" is not compatible with ${input.projectType}.`);
  }

  const config: RepoConfig = {
    schemaVersion: 1,
    plugin: { id: "repo-standard", version: "0.1.0" },
    project: { name: input.name, type: input.projectType, root: "." },
    composition: { ...(preset === undefined ? {} : { preset: `${preset.id}@${preset.version}` }), stack: { ...preset?.selection?.stack, ...input.stack }, capabilities: [...input.capabilities] },
    agents: { mode: input.agentMode, enabled: [], adapters: [] },
    flows: { defaults: [] },
    standards: { overrides: [] },
    managed: { stateFile: ".repo-standard/managed-state.yaml" }
  };

  return {
    targetDirectory,
    config,
    operations: ["write-config", "write-managed-state"],
    preview: `Create ${input.name} (${input.projectType}) at ${targetDirectory}.`
  };
};

export const applyCreatePlan = async (plan: CreatePlan, runner: GeneratorRunner = defaultGeneratorRunner): Promise<void> => {
  if (existsSync(plan.targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${plan.targetDirectory}.`);
  }

  await mkdir(plan.targetDirectory, { recursive: false });
  if (plan.config.project.type === "monorepo") {
    await writeMonorepoScaffold(plan.targetDirectory, plan.config.project.name);
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await runner.run(pnpm, ["create", "vite", "apps/web", "--template", "react-ts", "--no-interactive"], plan.targetDirectory);
    await runner.run(pnpm, ["install"], plan.targetDirectory);
  } else if (plan.config.composition.stack.framework === "vite@8") {
    await runner.run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["create", "vite", ".", "--template", "react-ts", "--no-interactive"], plan.targetDirectory);
  }
  const configPath = path.join(plan.targetDirectory, "repo.config.yaml");
  const configText = stringify(plan.config);
  await writeYamlAtomically(configPath, plan.config);
  await writeYamlAtomically(path.join(plan.targetDirectory, ".repo-standard", "managed-state.yaml"), createManagedState(configText));
};
