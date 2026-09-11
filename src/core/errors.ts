export type RepositoryStandardErrorCode =
  | "CONFIG_INVALID"
  | "MANIFEST_INVALID"
  | "PATH_OUTSIDE_ROOT"
  | "REGISTRY_CONFLICT";

export class RepositoryStandardError extends Error {
  public readonly code: RepositoryStandardErrorCode;
  public readonly diagnosticData?: Readonly<Record<string, unknown>>;

  public constructor(
    code: RepositoryStandardErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      diagnosticData?: Readonly<Record<string, unknown>>;
    }
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "RepositoryStandardError";
    this.code = code;

    if (options?.diagnosticData !== undefined) {
      this.diagnosticData = options.diagnosticData;
    }
  }
}
