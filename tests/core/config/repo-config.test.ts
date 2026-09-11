import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadRepoConfig, parseRepoConfig } from "../../../src/core/config/repo-config.js";

const validConfig = `
schemaVersion: 1
plugin: { id: repo-standard, version: 0.1.0 }
project: { name: demo, type: web-application, root: . }
composition: { stack: { runtime: nodejs@22 } }
agents: { mode: automatic, enabled: [], adapters: [] }
flows: { defaults: [feature] }
standards: { overrides: [] }
managed: { stateFile: .repo-standard/managed-state.yaml }
`;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repo.config.yaml", () => {
  it("parses a version-one project config", () => {
    const config = parseRepoConfig(validConfig);

    expect(config.project.name).toBe("demo");
    expect(config.composition.stack.runtime).toBe("nodejs@22");
  });

  it("rejects plaintext secret-like configuration keys", () => {
    expect(() => parseRepoConfig(`${validConfig}\napiKey: exposed`)).toThrow(/secret/i);
  });

  it("loads only the canonical configuration file under the project root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-config-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "repo.config.yaml"), validConfig, "utf8");

    await expect(loadRepoConfig(root)).resolves.toMatchObject({ project: { name: "demo" } });
  });
});
