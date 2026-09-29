import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { RepositoryStandardError } from "../core/errors.js";
import type {
  ExecutionPlan,
  GenerateOperation,
  GenerationResult,
  ManagedFile,
  RecordStateOperation,
  VerifyOperation,
  WriteConfigOperation
} from "../core/planning/execution-plan.js";
import { hashManagedFile } from "./managed-files.js";

export interface ExecutionHandlers {
  readonly generate: (operation: GenerateOperation) => Promise<GenerationResult>;
  readonly writeConfig: (operation: WriteConfigOperation) => Promise<void>;
  readonly verify: (operation: VerifyOperation, generatedFiles: readonly string[], managedFiles: readonly ManagedFile[]) => Promise<void>;
  readonly recordState: (operation: RecordStateOperation, managedFiles: readonly ManagedFile[]) => Promise<void>;
  readonly removeTarget?: (targetDirectory: string) => Promise<void>;
}

export const executePlan = async (plan: ExecutionPlan, handlers: ExecutionHandlers): Promise<void> => {
  const targetDirectory = path.resolve(plan.targetDirectory);
  if (existsSync(targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${targetDirectory}.`);
  }

  let ownsTarget = false;
  try {
    await mkdir(targetDirectory);
    ownsTarget = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === "EEXIST" ? `Target directory already exists: ${targetDirectory}.`
      : code === "ENOENT" ? `Parent directory does not exist: ${path.dirname(targetDirectory)}.`
        : `Cannot create target directory: ${targetDirectory}.`;
    throw new RepositoryStandardError("CONFIG_INVALID", message, { cause: error });
  }

  const generatedFiles = new Set<string>();
  const managedFiles = new Map<string, ManagedFile>();
  try {
    for (const operation of plan.operations) {
      switch (operation.type) {
        case "generate": {
          const result = await handlers.generate(operation);
          const reported = new Set<string>();
          const ownership = new Map<string, { owner: string; version?: string }>();
          for (const entry of result.ownership ?? []) {
            if (ownership.has(entry.path) || entry.owner.trim().length === 0 || (entry.version !== undefined && entry.version.trim().length === 0)) {
              throw new RepositoryStandardError("CONFIG_INVALID", `Invalid or duplicate generated owner: ${entry.path}.`);
            }
            ownership.set(entry.path, entry);
          }
          for (const file of result.files) {
            if (reported.has(file) || file === "repo.config.yaml") {
              throw new RepositoryStandardError("CONFIG_INVALID", `Invalid or duplicate generated output: ${file}.`);
            }
            reported.add(file);
            const hash = await hashManagedFile(targetDirectory, file);
            const prior = managedFiles.get(file);
            if (prior === undefined || prior.hash !== hash) {
              const specified = ownership.get(file);
              managedFiles.set(file, {
                path: file,
                owner: specified?.owner ?? `${operation.extension.kind}:${operation.extension.id}`,
                version: specified?.version ?? operation.extension.version,
                hash
              });
            }
            generatedFiles.add(file);
          }
          for (const file of ownership.keys()) {
            if (!reported.has(file)) throw new RepositoryStandardError("CONFIG_INVALID", `Generated owner has no reported output: ${file}.`);
          }
          break;
        }
        case "write-config":
          await handlers.writeConfig(operation);
          break;
        case "verify":
          await handlers.verify(operation, [...generatedFiles], [...managedFiles.values()]);
          break;
        case "record-state": {
          for (const file of managedFiles.values()) {
            if (await hashManagedFile(targetDirectory, file.path) !== file.hash) {
              throw new RepositoryStandardError("CONFIG_INVALID", `Managed output changed without being reported: ${file.path}.`);
            }
          }
          await handlers.recordState(operation, [...managedFiles.values()]);
          break;
        }
      }
    }
  } catch (error) {
    if (!ownsTarget) throw error;

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
