import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepoConfig } from "../../src/core/config/repo-config.js";
import type { ExecutionPlan } from "../../src/core/planning/execution-plan.js";
import { executePlan } from "../../src/execution/executor.js";

const roots: string[] = [];
const config: RepoConfig = { schemaVersion: 1, plugin: { id: "repo-standard", version: "0.1.0" }, project: { name: "demo", type: "web", root: "." }, composition: { stack: {}, capabilities: [] }, agents: { mode: "automatic", enabled: [], adapters: [] }, flows: { defaults: [] }, standards: { overrides: [] }, managed: { stateFile: ".repo-standard/managed-state.yaml" } };
const makePlan = async (): Promise<ExecutionPlan> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-executor-"));
  roots.push(root);
  const targetDirectory = path.join(root, "demo");
  return { targetDirectory, config, operations: [
    { type: "generate", extension: { kind: "project-type", id: "web", version: "1.0.0" }, targetDirectory },
    { type: "write-config", targetDirectory, config },
    { type: "verify", targetDirectory, phase: "generated" },
    { type: "record-state", targetDirectory },
    { type: "verify", targetDirectory, phase: "managed-state" }
  ] };
};
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("executePlan", () => {
  it("uses a generator's explicit owner for a reported file", async () => {
    const plan = await makePlan();
    const captured: unknown[] = [];
    await executePlan({ ...plan, operations: [plan.operations[0]!, { type: "record-state", targetDirectory: plan.targetDirectory }] }, {
      generate: async () => {
        await writeFile(path.join(plan.targetDirectory, "role.toml"), "role");
        return { files: ["role.toml"], ownership: [{ path: "role.toml", owner: "agent:backend", version: "1.0.0" }] };
      },
      writeConfig: async () => undefined,
      verify: async () => undefined,
      recordState: async (_operation, files) => { captured.push(...files); }
    });
    expect(captured).toEqual([{ path: "role.toml", owner: "agent:backend", version: "1.0.0", hash: expect.stringMatching(/^[a-f0-9]{64}$/u) }]);
  });
  it("rejects ownership metadata for an unreported file and rolls back", async () => {
    const plan = await makePlan();
    await expect(executePlan(plan, {
      generate: async () => ({ files: [], ownership: [{ path: "ghost.toml", owner: "agent:backend" }] }),
      writeConfig: async () => undefined,
      verify: async () => undefined,
      recordState: async () => undefined
    })).rejects.toThrow("Generated owner has no reported output: ghost.toml.");
    expect(existsSync(plan.targetDirectory)).toBe(false);
  });
  it("reports the last operation that actually changed each file", async () => {
    const plan = await makePlan();
    const targetDirectory = plan.targetDirectory;
    const operations: ExecutionPlan["operations"] = [
      { type: "generate", extension: { kind: "project-type", id: "web", version: "1.0.0" }, targetDirectory },
      { type: "generate", extension: { kind: "capability", id: "auth-custom", version: "2.0.0" }, targetDirectory },
      { type: "record-state", targetDirectory }
    ];
    const captured: unknown[] = [];
    await executePlan({ ...plan, operations }, {
      generate: async (operation) => {
        await writeFile(path.join(targetDirectory, "shared.txt"), operation.extension.kind === "capability" ? "changed" : "initial");
        if (operation.extension.kind === "project-type") await writeFile(path.join(targetDirectory, "base.txt"), "base");
        return { files: operation.extension.kind === "capability" ? ["base.txt", "shared.txt"] : ["base.txt", "shared.txt"] };
      },
      writeConfig: async () => undefined,
      verify: async () => undefined,
      recordState: async (_operation, files) => { captured.push(...files); }
    });
    expect(captured).toEqual([
      { path: "base.txt", owner: "project-type:web", version: "1.0.0", hash: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      { path: "shared.txt", owner: "capability:auth-custom", version: "2.0.0", hash: expect.stringMatching(/^[a-f0-9]{64}$/u) }
    ]);
  });
  it("reports a missing parent directory accurately", async () => {
    const plan = await makePlan();
    const targetDirectory = path.join(path.dirname(plan.targetDirectory), "missing", "demo");
    await expect(executePlan({ ...plan, targetDirectory }, {
      generate: async () => ({ files: [] }), writeConfig: async () => undefined,
      verify: async () => undefined, recordState: async () => undefined
    })).rejects.toThrow(`Parent directory does not exist: ${path.dirname(targetDirectory)}.`);
    expect(existsSync(targetDirectory)).toBe(false);
  });
  it("forwards generated files and both verification phases", async () => {
    const plan = await makePlan();
    const phases: string[] = [];
    await executePlan(plan, {
      generate: async () => {
        await writeFile(path.join(plan.targetDirectory, "generated.txt"), "generated");
        return { files: ["generated.txt"] };
      },
      writeConfig: async () => undefined,
      verify: async (operation, files) => { phases.push(operation.phase + ":" + files.join(",")); },
      recordState: async () => undefined
    });
    expect(phases).toEqual(["generated:generated.txt", "managed-state:generated.txt"]);
  });

  it("removes a target created before generator failure", async () => {
    const plan = await makePlan();
    await expect(executePlan(plan, {
      generate: async () => {
        expect(existsSync(plan.targetDirectory)).toBe(true);
        await writeFile(path.join(plan.targetDirectory, "partial.txt"), "partial");
        throw new Error("generator failed");
      },
      writeConfig: async () => undefined, verify: async () => undefined, recordState: async () => undefined
    })).rejects.toThrow("generator failed");
    expect(existsSync(plan.targetDirectory)).toBe(false);
  });

  it("preserves an existing target and surfaces cleanup failure with the primary cause", async () => {
    const existingPlan = await makePlan();
    await mkdir(existingPlan.targetDirectory);
    await writeFile(path.join(existingPlan.targetDirectory, "user.txt"), "keep");
    const generate = vi.fn(async () => ({ files: [] }));
    await expect(executePlan(existingPlan, { generate, writeConfig: async () => undefined, verify: async () => undefined, recordState: async () => undefined })).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    expect(generate).not.toHaveBeenCalled();
    expect(existsSync(path.join(existingPlan.targetDirectory, "user.txt"))).toBe(true);

    const failingPlan = await makePlan();
    const primary = new Error("write failed");
    const failure = executePlan(failingPlan, {
      generate: async () => ({ files: [] }),
      writeConfig: async () => { throw primary; }, verify: async () => undefined, recordState: async () => undefined,
      removeTarget: async () => { throw new Error("cannot remove"); }
    });
    await expect(failure).rejects.toMatchObject({ code: "CREATE_ROLLBACK_FAILED", diagnosticData: { targetDirectory: path.resolve(failingPlan.targetDirectory) } });
    await failure.catch((error: Error) => expect(error.cause).toBe(primary));
  });
});
