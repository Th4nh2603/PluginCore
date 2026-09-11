import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

export const writeYamlAtomically = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, stringify(value), "utf8");
  await rename(temporaryPath, filePath);
};

export const createManagedState = (configText: string): Record<string, unknown> => ({
  schemaVersion: 1,
  pluginVersion: "0.1.0",
  files: [{ path: "repo.config.yaml", hash: createHash("sha256").update(configText).digest("hex") }]
});
