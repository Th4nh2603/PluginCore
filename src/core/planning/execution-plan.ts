import type { RepoConfig } from "../config/repo-config.js";
import type { SelectedExtension } from "../resolver/contracts.js";

export interface GenerateOperation {
  readonly type: "generate";
  readonly extension: SelectedExtension;
  readonly targetDirectory: string;
}

export interface GenerationResult {
  readonly files: readonly string[];
  readonly ownership?: readonly GeneratedFileOwner[];
}

export interface GeneratedFileOwner {
  readonly path: string;
  readonly owner: string;
  readonly version?: string;
}

export interface ManagedFile {
  readonly path: string;
  readonly owner: string;
  readonly version?: string;
  readonly hash: string;
}

export type VerificationPhase = "generated" | "managed-state";

export interface WriteConfigOperation {
  readonly type: "write-config";
  readonly targetDirectory: string;
  readonly config: RepoConfig;
}

export interface VerifyOperation {
  readonly type: "verify";
  readonly targetDirectory: string;
  readonly phase: VerificationPhase;
}

export interface RecordStateOperation {
  readonly type: "record-state";
  readonly targetDirectory: string;
}

export type ExecutionOperation =
  | GenerateOperation
  | WriteConfigOperation
  | VerifyOperation
  | RecordStateOperation;

export interface ExecutionPlan {
  readonly targetDirectory: string;
  readonly config: RepoConfig;
  readonly operations: readonly ExecutionOperation[];
}
