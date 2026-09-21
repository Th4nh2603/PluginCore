import { existsSync } from "node:fs";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";
import {
  resolveCreateComposition,
  type CreateAuthenticationProvider
} from "../core/resolver/create-resolver.js";
import { planCreateExecution } from "../core/planning/create-planner.js";
import type { ExecutionPlan } from "../core/planning/execution-plan.js";
import { executePlan } from "../execution/executor.js";
import { createManagedState, writeYamlAtomically } from "../execution/project-state.js";
import { generateCreateScaffold } from "../execution/legacy-create-generator.js";
import { selectGenerationStrategy } from "../execution/generation-contract.js";
import { stringify } from "yaml";
import { defaultGeneratorRunner, type GeneratorRunner } from "./generator-runner.js";

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
  readonly executionPlan: ExecutionPlan;
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
  selectGenerationStrategy(resolution.config);
  const executionPlan = planCreateExecution({ resolution, targetDirectory });

  return {
    targetDirectory,
    config: resolution.config,
    executionPlan,
    operations: ["write-config", "write-managed-state"],
    preview: `Create ${input.name} (${input.projectType}) at ${targetDirectory}.`
  };
};

export const applyCreatePlan = async (plan: CreatePlan, runner: GeneratorRunner = defaultGeneratorRunner): Promise<void> => {
  selectGenerationStrategy(plan.config);
  const configText = stringify(plan.config);

  await executePlan(plan.executionPlan, {
    generate: async (operation) => {
      if (operation.extension.kind === "project-type") {
        await generateCreateScaffold(operation.targetDirectory, plan.config, runner);
      }
    },
    writeConfig: async (operation) => writeYamlAtomically(path.join(operation.targetDirectory, "repo.config.yaml"), operation.config),
    verify: async () => undefined,
    recordState: async (operation) => writeYamlAtomically(
      path.join(operation.targetDirectory, ".repo-standard", "managed-state.yaml"),
      createManagedState(configText)
    )
  });
};
