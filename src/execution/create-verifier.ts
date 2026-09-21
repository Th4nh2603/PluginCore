import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { loadRepoConfig, type RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { resolveProjectPath } from "../core/security/project-path.js";

const statePath = ".repo-standard/managed-state.yaml";

const invalid = (message: string, cause?: unknown): RepositoryStandardError =>
  new RepositoryStandardError("CONFIG_INVALID", message, cause === undefined ? undefined : { cause });

export const verifyGeneratedRepository = async (targetDirectory: string, files: readonly string[]): Promise<RepoConfig> => {
  const seen = new Set<string>();

  for (const file of files) {
    if (file.length === 0 || seen.has(file)) {
      throw invalid(`Generated file list contains an invalid path: ${file}.`);
    }
    seen.add(file);

    const resolved = resolveProjectPath(targetDirectory, file);
    let entry;
    try {
      entry = await lstat(resolved);
    } catch (error) {
      throw invalid(`Generated file is missing: ${file}.`, error);
    }
    if (!entry.isFile()) {
      throw invalid(`Generated output is not a file: ${file}.`);
    }
  }

  return loadRepoConfig(targetDirectory);
};

export const verifyManagedState = async (targetDirectory: string, configText: string): Promise<void> => {
  const targetStatePath = path.join(targetDirectory, statePath);
  let state: unknown;
  try {
    state = parse(await readFile(targetStatePath, "utf8"));
  } catch (error) {
    throw invalid(`Unable to read ${statePath}.`, error);
  }

  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw invalid("Managed state must be an object.");
  }
  const files = (state as Record<string, unknown>).files;
  const first = Array.isArray(files) ? files[0] : undefined;
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw invalid("Managed state must record repo.config.yaml.");
  }

  const entry = first as Record<string, unknown>;
  const expectedHash = createHash("sha256").update(configText).digest("hex");
  if (entry.path !== "repo.config.yaml" || entry.hash !== expectedHash) {
    throw invalid("Managed state does not match repo.config.yaml.");
  }
};
