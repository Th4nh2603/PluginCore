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
  it("forwards generated files and both verification phases", async () => {
    const plan = await makePlan();
    const phases: string[] = [];
    await executePlan(plan, {
      generate: async () => ({ files: ["generated.txt"] }),
      writeConfig: async () => undefined,
      verify: async (operation, files) => { phases.push(operation.phase + ":" + files.join(",")); },
      recordState: async () => undefined
    });
    expect(phases).toEqual(["generated:generated.txt", "managed-state:generated.txt"]);
  });

  it("removes a target created before generator failure", async () => {
    const plan = await makePlan();
    await expect(executePlan(plan, {
      generate: async () => { await mkdir(plan.targetDirectory); await writeFile(path.join(plan.targetDirectory, "partial.txt"), "partial"); throw new Error("generator failed"); },
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
    await expect(executePlan(failingPlan, {
      generate: async () => { await mkdir(failingPlan.targetDirectory); return { files: [] }; },
      writeConfig: async () => { throw primary; }, verify: async () => undefined, recordState: async () => undefined,
      removeTarget: async () => { throw new Error("cannot remove"); }
    })).rejects.toMatchObject({ code: "CREATE_ROLLBACK_FAILED", cause: primary, diagnosticData: { targetDirectory: path.resolve(failingPlan.targetDirectory) } });
  });
});
