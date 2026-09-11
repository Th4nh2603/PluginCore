import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "../../src/application/doctor-service.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-doctor-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("runDoctor", () => {
  it("reports a missing repo.config.yaml as a warning", async () => {
    const report = await runDoctor({ projectRoot: await makeRoot() });

    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "CONFIG_MISSING" }));
    expect(report.errors).toEqual([]);
  });

  it("reports a valid config as passed", async () => {
    const root = await makeRoot();
    await writeFile(
      path.join(root, "repo.config.yaml"),
      "schemaVersion: 1\nplugin: { id: repo-standard, version: 0.1.0 }\nproject: { name: demo, type: empty, root: . }\ncomposition: { stack: {} }\nagents: { mode: automatic, enabled: [], adapters: [] }\nflows: { defaults: [] }\nstandards: { overrides: [] }\nmanaged: { stateFile: .repo-standard/managed-state.yaml }\n",
      "utf8"
    );

    const report = await runDoctor({ projectRoot: root });

    expect(report.passed).toContainEqual(expect.objectContaining({ code: "CONFIG_VALID" }));
  });
});
