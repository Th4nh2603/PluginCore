import { existsSync } from "node:fs";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";

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

  const config: RepoConfig = {
    schemaVersion: 1,
    plugin: { id: "repo-standard", version: "0.1.0" },
    project: { name: input.name, type: input.projectType, root: "." },
    composition: { ...(input.preset === undefined ? {} : { preset: input.preset }), stack: { ...input.stack }, capabilities: [...input.capabilities] },
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
