import { existsSync } from "node:fs";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";
import {
  resolveCreateComposition,
  type CreateAuthenticationProvider
} from "../core/resolver/create-resolver.js";

export { applyCreatePlan } from "./legacy-create-service.js";

export type AuthenticationProvider = CreateAuthenticationProvider;

export interface CreateInput {
  readonly name: string;
  readonly targetDirectory: string;
  readonly registryRoot: string;
  readonly projectType: string;
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly capabilities: readonly { readonly id: string; readonly version: string; readonly configRef?: string }[];
  readonly agentMode: RepoConfig["agents"]["mode"];
  readonly authentication?: AuthenticationProvider;
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
  const resolution = resolveCreateComposition({
    name: input.name,
    projectType: input.projectType,
    stack: input.stack,
    capabilities: input.capabilities,
    agentMode: input.agentMode,
    registry,
    ...(input.preset === undefined ? {} : { preset: input.preset }),
    ...(input.authentication === undefined ? {} : { authentication: input.authentication })
  });

  return {
    targetDirectory,
    config: resolution.config,
    operations: ["write-config", "write-managed-state"],
    preview: `Create ${input.name} (${input.projectType}) at ${targetDirectory}.`
  };
};
