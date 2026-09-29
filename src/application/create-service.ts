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
import { verifyGeneratedRepository, verifyManagedState } from "../execution/create-verifier.js";
import { createManagedState, writeYamlAtomically } from "../execution/project-state.js";
import { generateCreateScaffold } from "../execution/legacy-create-generator.js";
import { selectGenerationStrategy } from "../execution/generation-contract.js";
import { selectAuthenticationExecutor } from "../execution/capabilities/authentication.js";
import { selectCapabilityGenerator } from "../execution/capabilities/capability-generator.js";
import { selectAgentAdapter } from "../execution/agents/adapters.js";
import type { AgentResolution } from "../core/resolver/agent-resolver.js";
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
  readonly agents?: readonly string[];
  readonly authentication?: AuthenticationProvider;
}

export interface CreatePlan {
  readonly targetDirectory: string;
  readonly config: RepoConfig;
  readonly executionPlan: ExecutionPlan;
  readonly operations: readonly ("write-config" | "write-managed-state")[];
  readonly preview: string;
  readonly agentResolution: AgentResolution;
}

const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const validateCreateDestination = (name: string, targetDirectory: string): string => {
  if (name.length > 100 || !validName.test(name)) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Project name must be 1–100 lowercase letters, numbers, or internal hyphens.");
  }

  const resolvedTarget = path.resolve(targetDirectory);
  if (existsSync(resolvedTarget)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${resolvedTarget}.`);
  }
  return resolvedTarget;
};

export const planCreate = async (input: CreateInput): Promise<CreatePlan> => {
  const targetDirectory = validateCreateDestination(input.name, input.targetDirectory);

  const registry = await loadRegistry(input.registryRoot);
  const resolution = resolveCreateComposition({
    name: input.name,
    projectType: input.projectType,
    stack: input.stack,
    capabilities: input.capabilities,
    agentMode: input.agentMode,
    ...(input.agents === undefined ? {} : { agents: input.agents }),
    registry,
    ...(input.preset === undefined ? {} : { preset: input.preset }),
    ...(input.authentication === undefined ? {} : { authentication: input.authentication })
  });
  selectGenerationStrategy(resolution.config);
  selectAuthenticationExecutor(resolution.config);
  for (const operation of resolution.selected) {
    if (operation.kind === "capability") selectCapabilityGenerator(operation.id);
  }
  for (const id of resolution.config.agents.adapters) selectAgentAdapter(id);
  const executionPlan = planCreateExecution({ resolution, targetDirectory });

  return {
    targetDirectory,
    config: resolution.config,
    executionPlan,
    agentResolution: resolution.agentResolution,
    operations: ["write-config", "write-managed-state"],
    preview: `Create ${input.name} (${input.projectType}) at ${targetDirectory}.\nAgents (${input.agentMode}): ${resolution.agentResolution.enabled.map((agent) => agent.id).join(", ") || "none"}.\n${resolution.agentResolution.explanation.join("\n")}`
  };
};

export const applyCreatePlan = async (plan: CreatePlan, runner: GeneratorRunner = defaultGeneratorRunner): Promise<void> => {
  selectGenerationStrategy(plan.config);
  const configText = stringify(plan.config);

  await executePlan(plan.executionPlan, {
    generate: async (operation) => {
      if (operation.extension.kind === "project-type") {
        return generateCreateScaffold(operation.targetDirectory, plan.config, runner, true);
      }
      if (operation.extension.kind === "capability") {
        return selectCapabilityGenerator(operation.extension.id)(operation.targetDirectory, plan.config, operation.extension.id, runner);
      }
      if (operation.extension.kind === "adapter") {
        return selectAgentAdapter(operation.extension.id).render(operation.targetDirectory, plan.agentResolution);
      }
      return { files: [] };
    },
    writeConfig: async (operation) => writeYamlAtomically(path.join(operation.targetDirectory, "repo.config.yaml"), operation.config),
    verify: async (operation, generatedFiles, managedFiles) => {
      if (operation.phase === "generated") {
        await verifyGeneratedRepository(operation.targetDirectory, generatedFiles);
        return;
      }
      await verifyManagedState(operation.targetDirectory, configText, managedFiles);
    },
    recordState: async (operation, managedFiles) => writeYamlAtomically(
      path.join(operation.targetDirectory, ".repo-standard", "managed-state.yaml"),
      createManagedState(configText, managedFiles)
    )
  });
};
