import { loadRepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import type { Diagnostic } from "../core/validation/validation.js";

export interface DoctorInput {
  readonly projectRoot: string;
}

export interface DoctorReport {
  readonly passed: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
}

const isMissingFileError = (error: RepositoryStandardError): boolean =>
  typeof error.cause === "object" && error.cause !== null && "code" in error.cause && error.cause.code === "ENOENT";

export const runDoctor = async (input: DoctorInput): Promise<DoctorReport> => {
  try {
    await loadRepoConfig(input.projectRoot);
    return { passed: [{ severity: "info", code: "CONFIG_VALID", message: "Project configuration is valid." }], warnings: [], errors: [] };
  } catch (error) {
    if (error instanceof RepositoryStandardError && isMissingFileError(error)) {
      return { passed: [], warnings: [{ severity: "warning", code: "CONFIG_MISSING", message: "repo.config.yaml was not found." }], errors: [] };
    }

    return { passed: [], warnings: [], errors: [{ severity: "error", code: "CONFIG_INVALID", message: error instanceof Error ? error.message : "Project configuration is invalid." }] };
  }
};
