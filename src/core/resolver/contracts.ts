import type { RepoConfig } from "../config/repo-config.js";
import type { Registry } from "../registry/registry-loader.js";
import type { Diagnostic } from "../validation/validation.js";

export interface SelectedExtension {
  readonly kind: string;
  readonly id: string;
  readonly version: string;
}

export interface ResolutionOperation {
  readonly type: "generate" | "configure" | "verify" | "record";
  readonly extensionId: string;
  readonly description: string;
}

export interface UnresolvedSelection {
  readonly id: string;
  readonly reason: string;
  readonly required: boolean;
}

export interface ResolutionExplanation {
  readonly subject: string;
  readonly reason: string;
}

export interface ResolutionInput {
  readonly config: RepoConfig;
  readonly registry: Registry;
}

export interface ResolutionPlan {
  readonly selected: readonly SelectedExtension[];
  readonly operations: readonly ResolutionOperation[];
  readonly unresolved: readonly UnresolvedSelection[];
  readonly explanations: readonly ResolutionExplanation[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface Resolver<TInput, TPlan> {
  resolve(input: TInput): Promise<TPlan>;
}

export const validatePlan = (plan: ResolutionPlan): readonly Diagnostic[] => [
  ...plan.diagnostics,
  ...plan.unresolved.map((selection): Diagnostic => ({
    severity: selection.required ? "error" : "warning",
    code: selection.required ? "REQUIRED_EXTENSION_UNRESOLVED" : "OPTIONAL_EXTENSION_UNRESOLVED",
    message: `Extension ${selection.id} is unresolved: ${selection.reason}.`,
    subject: selection.id
  }))
];
