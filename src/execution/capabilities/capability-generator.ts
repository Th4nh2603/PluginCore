import type { RepoConfig } from "../../core/config/repo-config.js";
import { RepositoryStandardError } from "../../core/errors.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";
import type { GeneratorRunner } from "../generator-runner.js";
import { generateAuthenticationCapability } from "./authentication.js";

export type CapabilityGenerator = (
  targetDirectory: string,
  config: RepoConfig,
  capabilityId: string,
  runner: GeneratorRunner
) => Promise<GenerationResult>;

const generators: Readonly<Record<string, CapabilityGenerator>> = {
  "auth-custom": generateAuthenticationCapability,
  "auth-clerk": generateAuthenticationCapability
};

export const selectCapabilityGenerator = (id: string): CapabilityGenerator => {
  const generator = generators[id];
  if (generator === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `No capability generator is available for "${id}".`);
  }
  return generator;
};
