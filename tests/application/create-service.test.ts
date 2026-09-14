import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-create-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("planCreate", () => {
  it("resolves a project type from the registry and returns a no-write plan", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", { encoding: "utf8", flag: "w" });
    const targetDirectory = path.join(root, "demo");

    const plan = await planCreate({ name: "demo", projectType: "empty", targetDirectory, registryRoot, stack: {}, agentMode: "automatic", capabilities: [] });

    expect(plan.config.project.type).toBe("empty");
    expect(existsSync(targetDirectory)).toBe(false);
  });

  it("writes only config and managed state after applying a plan", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", "utf8");
    const targetDirectory = path.join(root, "demo");
    const plan = await planCreate({ name: "demo", projectType: "empty", targetDirectory, registryRoot, stack: {}, agentMode: "automatic", capabilities: [] });

    await applyCreatePlan(plan);

    expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    expect(existsSync(path.join(targetDirectory, ".repo-standard", "managed-state.yaml"))).toBe(true);
  });

  it("applies an extension-provided recommended preset", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "web", "..", "..", "presets", "recommended-web"), { recursive: true });
    await mkdir(path.join(registryRoot, "project-types", "web"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "web", "manifest.yaml"), "schemaVersion: 1\nid: web\nkind: project-type\nversion: 1.0.0\ndisplayName: Web\n", "utf8");
    await writeFile(path.join(registryRoot, "presets", "recommended-web", "manifest.yaml"), "schemaVersion: 1\nid: recommended-web\nkind: preset\nversion: 1.0.0\ndisplayName: Recommended Web\ncompatibility: { projectTypes: [web] }\nselection: { stack: { framework: nextjs@15, language: typescript@5, packageManager: pnpm@10 } }\n", "utf8");

    const plan = await planCreate({ name: "demo", projectType: "web", targetDirectory: path.join(root, "demo"), registryRoot, preset: "recommended-web", stack: {}, agentMode: "automatic", capabilities: [] });

    expect(plan.config.composition.preset).toBe("recommended-web@1.0.0");
    expect(plan.config.composition.stack).toEqual({ framework: "nextjs@15", language: "typescript@5", packageManager: "pnpm@10" });
  });

  it("runs the Vite React TypeScript generator before writing managed state", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "web-demo");
    const plan = await planCreate({ name: "web-demo", projectType: "web", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-web", stack: {}, agentMode: "automatic", capabilities: [] });
    const commands: string[][] = [];

    await applyCreatePlan(plan, {
      run: async (command, args, cwd) => {
        commands.push([command, ...args, cwd]);
      }
    });

    expect(commands).toEqual([[(process.platform === "win32" ? "pnpm.cmd" : "pnpm"), "create", "vite", ".", "--template", "react-ts", "--no-interactive", targetDirectory]]);
    expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
  });
});
