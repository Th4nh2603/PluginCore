import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import { RepositoryStandardError } from "../core/errors.js";
import type {
  ExecutionPlan,
  GenerateOperation,
  GenerationResult,
  RecordStateOperation,
  VerifyOperation,
  WriteConfigOperation
} from "../core/planning/execution-plan.js";

export interface ExecutionHandlers {
  readonly generate: (operation: GenerateOperation) => Promise<GenerationResult>;
  readonly writeConfig: (operation: WriteConfigOperation) => Promise<void>;
  readonly verify: (operation: VerifyOperation, generatedFiles: readonly string[]) => Promise<void>;
  readonly recordState: (operation: RecordStateOperation) => Promise<void>;
  readonly removeTarget?: (targetDirectory: string) => Promise<void>;
}

export const executePlan = async (plan: ExecutionPlan, handlers: ExecutionHandlers): Promise<void> => {
  const targetDirectory = path.resolve(plan.targetDirectory);
  if (existsSync(targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${targetDirectory}.`);
  }

  const generatedFiles = new Set<string>();
  try {
    for (const operation of plan.operations) {
      switch (operation.type) {
        case "generate": {
          const result = await handlers.generate(operation);
          for (const file of result.files) generatedFiles.add(file);
          break;
        }
        case "write-config":
          await handlers.writeConfig(operation);
          break;
        case "verify":
          await handlers.verify(operation, [...generatedFiles]);
          break;
        case "record-state":
          await handlers.recordState(operation);
          break;
      }
    }
  } catch (error) {
    if (!existsSync(targetDirectory)) throw error;

    try {
      await (handlers.removeTarget ?? ((target) => rm(target, { recursive: true, force: true })))(targetDirectory);
    } catch (rollbackError) {
      throw new RepositoryStandardError(
        "CREATE_ROLLBACK_FAILED",
        `Could not remove failed project directory: ${targetDirectory}.`,
        { cause: error, diagnosticData: { targetDirectory, rollbackError } }
      );
    }
    throw error;
  }
};
