import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import type { RepoConfig } from "../../src/core/config/repo-config.js";
import { createManagedState } from "../../src/execution/project-state.js";
import { verifyGeneratedRepository, verifyManagedState } from "../../src/execution/create-verifier.js";

const roots: string[] = [];

const config: RepoConfig = {
  schemaVersion: 1,
  plugin: { id: "repo-standard", version: "0.1.0" },
  project: { name: "demo", type: "empty", root: "." },
  composition: { stack: {}, capabilities: [] },
  agents: { mode: "automatic", enabled: [], adapters: [] },
  flows: { defaults: [] },
  standards: { overrides: [] },
  managed: { stateFile: ".repo-standard/managed-state.yaml" }
};

const makeTarget = async (): Promise<string> => {
  const target = await mkdtemp(path.join(os.tmpdir(), "repo-standard-verifier-"));
  roots.push(target);
  return target;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("create verifier", () => {
  it("accepts legacy config-only v1 state when no generated inventory is expected", async () => {
    const target = await makeTarget();
    const configText = stringify(config);
    await writeFile(path.join(target, "repo.config.yaml"), configText);
    await mkdir(path.join(target, ".repo-standard"));
    await writeFile(path.join(target, ".repo-standard", "managed-state.yaml"), stringify({
      schemaVersion: 1,
      pluginVersion: "0.1.0",
      files: [{ path: "repo.config.yaml", hash: createHash("sha256").update(configText).digest("hex") }]
    }));
    await expect(verifyManagedState(target, configText)).resolves.toBeUndefined();
    await expect(verifyManagedState(target, configText, [])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
  it("checks every managed file hash and required ownership record", async () => {
    const target = await makeTarget();
    const configText = stringify(config);
    await writeFile(path.join(target, "repo.config.yaml"), configText);
    await writeFile(path.join(target, "generated.txt"), "original");
    const generated = { path: "generated.txt", owner: "project-type:empty", version: "1.0.0",
      hash: createHash("sha256").update("original").digest("hex") };
    await mkdir(path.join(target, ".repo-standard"));
    await writeFile(path.join(target, ".repo-standard", "managed-state.yaml"), stringify(createManagedState(configText, [generated])));

    await expect(verifyManagedState(target, configText, [generated])).resolves.toBeUndefined();
    await writeFile(path.join(target, "generated.txt"), "changed");
    await expect(verifyManagedState(target, configText, [generated])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await writeFile(path.join(target, "generated.txt"), "original");
    await writeFile(path.join(target, ".repo-standard", "managed-state.yaml"), stringify(createManagedState(configText)));
    await expect(verifyManagedState(target, configText, [generated])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
  it("validates reported generated files and repo config", async () => {
    const target = await makeTarget();
    await writeFile(path.join(target, "generated.txt"), "ok");
    await writeFile(path.join(target, "repo.config.yaml"), stringify(config));

    await expect(verifyGeneratedRepository(target, ["generated.txt"])).resolves.toEqual(config);
  });

  it("rejects an output path that escapes the target", async () => {
    const target = await makeTarget();

    await expect(verifyGeneratedRepository(target, ["../outside.txt"])).rejects.toMatchObject({ code: "PATH_OUTSIDE_ROOT" });
  });

  it("rejects an absolute reported output path", async () => {
    const target = await makeTarget();
    const generated = path.join(target, "generated.txt");
    await writeFile(generated, "ok");

    await expect(verifyGeneratedRepository(target, [generated])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("rejects a missing reported generated file", async () => {
    const target = await makeTarget();
    await writeFile(path.join(target, "repo.config.yaml"), stringify(config));

    await expect(verifyGeneratedRepository(target, ["missing.txt"])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("rejects missing or mismatched managed state", async () => {
    const target = await makeTarget();
    const configText = stringify(config);

    await expect(verifyManagedState(target, configText)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await mkdir(path.join(target, ".repo-standard"));
    await writeFile(path.join(target, ".repo-standard", "managed-state.yaml"), stringify({
      ...createManagedState(configText),
      files: [{ path: "repo.config.yaml", hash: "wrong" }]
    }));

    await expect(verifyManagedState(target, configText)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});
