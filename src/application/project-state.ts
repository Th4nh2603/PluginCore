import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

import type { ManagedFile } from "../core/planning/execution-plan.js";

export interface ManagedState {
  readonly schemaVersion: 1;
  readonly pluginVersion: string;
  readonly files: readonly ManagedFile[];
}

export const writeYamlAtomically = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, stringify(value), "utf8");
  await rename(temporaryPath, filePath);
};

export const createManagedState = (configText: string, generatedFiles: readonly ManagedFile[] = []): ManagedState => ({
  schemaVersion: 1,
  pluginVersion: "0.1.0",
  files: [
    { path: "repo.config.yaml", owner: "core", hash: createHash("sha256").update(configText).digest("hex") },
    ...generatedFiles
  ]
});
