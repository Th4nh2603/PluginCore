import type { CreateResolutionPlan } from "../resolver/create-resolver.js";
import type { ExecutionOperation, ExecutionPlan } from "./execution-plan.js";

export interface CreatePlanningInput {
  readonly resolution: CreateResolutionPlan;
  readonly targetDirectory: string;
}

export const planCreateExecution = (input: CreatePlanningInput): ExecutionPlan => {
  const generateOperations: ExecutionOperation[] = input.resolution.selected
    .filter((extension) => extension.kind !== "preset")
    .map((extension) => ({
      type: "generate" as const,
      extension,
      targetDirectory: input.targetDirectory
    }));

  return {
    targetDirectory: input.targetDirectory,
    config: input.resolution.config,
    operations: [
      ...generateOperations,
      { type: "write-config", targetDirectory: input.targetDirectory, config: input.resolution.config },
      { type: "verify", targetDirectory: input.targetDirectory },
      { type: "record-state", targetDirectory: input.targetDirectory }
    ]
  };
};
