import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { loadRepoConfig, type RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import type { ManagedFile } from "../core/planning/execution-plan.js";
import { resolveProjectPath } from "../core/security/project-path.js";
import { hashManagedFile } from "./managed-files.js";

const statePath = ".repo-standard/managed-state.yaml";

const invalid = (message: string, cause?: unknown): RepositoryStandardError =>
  new RepositoryStandardError("CONFIG_INVALID", message, cause === undefined ? undefined : { cause });

export const verifyGeneratedRepository = async (targetDirectory: string, files: readonly string[]): Promise<RepoConfig> => {
  const seen = new Set<string>();
  const physicalTarget = await realpath(targetDirectory);

  for (const file of files) {
    if (file.length === 0 || path.isAbsolute(file) || seen.has(file)) {
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
    const physicalFile = await realpath(resolved);
    if (!physicalFile.startsWith(`${physicalTarget}${path.sep}`)) {
      throw invalid(`Generated output resolves outside the target: ${file}.`);
    }
  }

  return loadRepoConfig(targetDirectory);
};

export const verifyManagedState = async (
  targetDirectory: string,
  configText: string,
  expectedFiles?: readonly ManagedFile[]
): Promise<void> => {
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
  const stateRecord = state as Record<string, unknown>;
  const files = stateRecord.files;
  if (stateRecord.schemaVersion !== 1 || typeof stateRecord.pluginVersion !== "string" || !Array.isArray(files)) {
    throw invalid("Managed state has an invalid structure.");
  }
  const expected = expectedFiles === undefined ? undefined : new Map(expectedFiles.map((file) => [file.path, file]));
  const seen = new Set<string>();
  const expectedHash = createHash("sha256").update(configText).digest("hex");
  for (const raw of files) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid("Managed state contains an invalid file record.");
    const entry = raw as Record<string, unknown>;
    if (typeof entry.path !== "string" || typeof entry.owner !== "string" || entry.owner.length === 0 ||
      typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/u.test(entry.hash) ||
      (entry.version !== undefined && (typeof entry.version !== "string" || entry.version.length === 0)) ||
      seen.has(entry.path)) {
      throw invalid("Managed state contains an invalid or duplicate file record.");
    }
    seen.add(entry.path);
    if (entry.path === "repo.config.yaml") {
      if (entry.owner !== "core" || entry.version !== undefined || entry.hash !== expectedHash) {
        throw invalid("Managed state does not match repo.config.yaml.");
      }
    } else if (expected !== undefined) {
      const match = expected.get(entry.path);
      if (match === undefined || match.owner !== entry.owner || match.version !== entry.version || match.hash !== entry.hash) {
        throw invalid(`Managed state does not match generated output: ${entry.path}.`);
      }
    }
    if (await hashManagedFile(targetDirectory, entry.path) !== entry.hash) {
      throw invalid(`Managed file hash does not match: ${entry.path}.`);
    }
  }
  if (!seen.has("repo.config.yaml") || (expected !== undefined && seen.size !== expected.size + 1)) {
    throw invalid("Managed state is missing required file records.");
  }
};
