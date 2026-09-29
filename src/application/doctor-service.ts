import { stat } from "node:fs/promises";

import { loadRepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";
import type { Diagnostic } from "../core/validation/validation.js";

export interface DoctorInput {
  readonly projectRoot: string;
  readonly registryRoot?: string;
}

export interface DoctorReport {
  readonly passed: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
}

const isMissingFileError = (error: RepositoryStandardError): boolean =>
  typeof error.cause === "object" && error.cause !== null && "code" in error.cause && error.cause.code === "ENOENT";

const registryErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return "Extension registry is invalid.";
  if (!(error instanceof RepositoryStandardError)) return error.message;

  const issues = error.diagnosticData?.issues;
  if (!Array.isArray(issues)) return error.message;

  const details = issues.slice(0, 3).flatMap((issue: unknown) => {
    if (typeof issue !== "object" || issue === null || !("path" in issue) || !("message" in issue)) return [];
    if (!Array.isArray(issue.path) || typeof issue.message !== "string") return [];
    const field = issue.path.map(String).join(".") || "manifest";
    return [`${field}: ${issue.message}`];
  });
  return details.length > 0 ? `${error.message} ${details.join("; ")}` : error.message;
};

export const runDoctor = async (input: DoctorInput): Promise<DoctorReport> => {
  const passed: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];
  try {
    const projectRoot = await stat(input.projectRoot);
    if (!projectRoot.isDirectory()) {
      throw new RepositoryStandardError("CONFIG_INVALID", `Project root is not a directory: ${input.projectRoot}.`);
    }
  } catch (error) {
    errors.push({ severity: "error", code: "CONFIG_INVALID", message: error instanceof Error ? error.message : "Project root is invalid." });
  }
  if (errors.length === 0) {
    try {
      await loadRepoConfig(input.projectRoot);
      passed.push({ severity: "info", code: "CONFIG_VALID", message: "Project configuration is valid." });
    } catch (error) {
      if (error instanceof RepositoryStandardError && isMissingFileError(error)) {
        warnings.push({ severity: "warning", code: "CONFIG_MISSING", message: "repo.config.yaml was not found." });
      } else {
        errors.push({ severity: "error", code: "CONFIG_INVALID", message: error instanceof Error ? error.message : "Project configuration is invalid." });
      }
    }
  }
  if (input.registryRoot !== undefined) {
    try {
      await loadRegistry(input.registryRoot);
      passed.push({ severity: "info", code: "REGISTRY_VALID", message: "Extension registry is valid." });
    } catch (error) {
      errors.push({ severity: "error", code: "REGISTRY_INVALID", message: registryErrorMessage(error) });
    }
  }
  return { passed, warnings, errors };
};
