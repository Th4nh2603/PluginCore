import path from "node:path";

import { RepositoryStandardError } from "../errors.js";

export const resolveProjectPath = (projectRoot: string, requestedPath: string): string => {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(resolvedRoot, requestedPath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new RepositoryStandardError(
      "PATH_OUTSIDE_ROOT",
      `Path "${requestedPath}" resolves outside the project root.`,
      { diagnosticData: { projectRoot: resolvedRoot, requestedPath } }
    );
  }

  return resolvedPath;
};
