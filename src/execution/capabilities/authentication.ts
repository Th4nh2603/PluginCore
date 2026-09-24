import type { RepoConfig } from "../../core/config/repo-config.js";
import { RepositoryStandardError } from "../../core/errors.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";
import { applyCustomAuthentication } from "../custom-stack-generator.js";
import { listGeneratedFiles } from "../generated-files.js";
import { selectGenerationStrategy } from "../generation-contract.js";
import type { GeneratorRunner } from "../generator-runner.js";
import { clerkBackendFiles, clerkEnvironment, clerkFrontendFiles, clerkReadmeEnd, clerkReadmeSetup, writeMonorepoClerkScaffold } from "./auth-clerk.js";
import { customBackendFiles, customEnvironment, customFrontendFiles, customReadmeEnd, customReadmeSetup, writeLegacyCustomAuthentication } from "./auth-custom.js";
import { hasMcpCapability } from "./mcp-selection.js";

export interface AuthenticationExecutor {
  readonly provider: string;
  readonly generateLegacy: (targetDirectory: string, name: string, mcpEnabled: boolean) => Promise<void>;
  readonly frontendFiles: (name: string, frontend: string) => Record<string, string>;
  readonly backendFiles: (name: string, backend: string, orm: string, mcpEnabled: boolean) => Record<string, string>;
  readonly environment: () => string;
  readonly readmeSetup: string;
  readonly readmeAfterBuild: string;
  readonly readmeAfterMigrations: string;
}

const executors: Readonly<Record<string, AuthenticationExecutor>> = {
  "auth-custom": {
    provider: "custom",
    generateLegacy: writeLegacyCustomAuthentication,
    frontendFiles: customFrontendFiles,
    backendFiles: customBackendFiles,
    environment: customEnvironment,
    readmeSetup: customReadmeSetup,
    readmeAfterBuild: customReadmeEnd,
    readmeAfterMigrations: ""
  },
  "auth-clerk": {
    provider: "clerk",
    generateLegacy: writeMonorepoClerkScaffold,
    frontendFiles: clerkFrontendFiles,
    backendFiles: clerkBackendFiles,
    environment: clerkEnvironment,
    readmeSetup: clerkReadmeSetup,
    readmeAfterBuild: "",
    readmeAfterMigrations: clerkReadmeEnd
  }
};

export const selectAuthenticationExecutor = (config: RepoConfig): AuthenticationExecutor | undefined => {
  if (config.project.type !== "monorepo") return undefined;

  const selected = config.composition.capabilities?.filter((capability) => capability.id.startsWith("auth-")) ?? [];
  if (selected.length > 1) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Select exactly one authentication capability for Monorepo.");
  }
  const id = selected[0]?.id ?? (config.composition.authentication === undefined ? undefined : `auth-${config.composition.authentication}`);
  if (id === undefined) return undefined;
  const executor = executors[id];
  if (executor === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `No authentication executor is available for "${id}".`);
  }
  return executor;
};

export const generateAuthenticationCapability = async (
  targetDirectory: string,
  config: RepoConfig,
  capabilityId: string,
  runner: GeneratorRunner
): Promise<GenerationResult> => {
  const executor = selectAuthenticationExecutor(config);
  if (executor === undefined || capabilityId !== `auth-${executor.provider}`) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Authentication capability "${capabilityId}" does not match the resolved configuration.`);
  }

  const strategy = selectGenerationStrategy(config);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (strategy === "custom") {
    await applyCustomAuthentication(targetDirectory, config, runner, executor);
  } else if (strategy === "monorepo") {
    await executor.generateLegacy(targetDirectory, config.project.name, hasMcpCapability(config));
    await runner.run(pnpm, ["install"], targetDirectory);
    await runner.run(pnpm, ["--filter", "./apps/api", "exec", "prisma", "generate"], targetDirectory);
  } else {
    throw new RepositoryStandardError("CONFIG_INVALID", `Authentication capability is not supported by the ${strategy} generator.`);
  }
  return { files: await listGeneratedFiles(targetDirectory) };
};
