import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { RepositoryStandardError } from "../core/errors.js";
import { resolveProjectPath } from "../core/security/project-path.js";

export const hashManagedFile = async (targetDirectory: string, relativePath: string): Promise<string> => {
  if (relativePath.length === 0 || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
    relativePath.includes("\\") || relativePath === "." || path.posix.normalize(relativePath) !== relativePath) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Invalid managed file path: ${relativePath}.`);
  }
  const filePath = resolveProjectPath(targetDirectory, relativePath);
  let entry;
  try {
    entry = await lstat(filePath);
  } catch (error) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Managed file is missing: ${relativePath}.`, { cause: error });
  }
  if (!entry.isFile()) throw new RepositoryStandardError("CONFIG_INVALID", `Managed output is not a regular file: ${relativePath}.`);
  const physicalTarget = await realpath(targetDirectory);
  const physicalFile = await realpath(filePath);
  if (!physicalFile.startsWith(`${physicalTarget}${path.sep}`)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Managed output resolves outside the target: ${relativePath}.`);
  }
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
};
