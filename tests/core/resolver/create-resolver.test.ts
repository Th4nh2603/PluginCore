import { describe, expect, it } from "vitest";

import { RepoConfigSchema } from "../../../src/core/config/repo-config.js";
import { Registry } from "../../../src/core/registry/registry-loader.js";
import type { ExtensionManifest } from "../../../src/core/registry/manifest.js";
import { resolveCreateComposition } from "../../../src/core/resolver/create-resolver.js";

const projectType = (id: string): ExtensionManifest => ({
  schemaVersion: 1,
  id,
  kind: "project-type",
  version: "1.0.0",
  displayName: id
});

const preset = (
  id: string,
  projectTypes: readonly string[],
  stack: Readonly<Record<string, string>>
): ExtensionManifest => ({
  schemaVersion: 1,
  id,
  kind: "preset",
  version: "1.0.0",
  displayName: id,
  compatibility: { projectTypes: [...projectTypes] },
  selection: { stack: { ...stack } }
});

const capability = (id: string, projectTypes: readonly string[]): ExtensionManifest => ({
  schemaVersion: 1,
  id,
  kind: "capability",
  version: "1.0.0",
  displayName: id,
  compatibility: { projectTypes: [...projectTypes] }
});

const input = (registry: Registry, overrides: Partial<Parameters<typeof resolveCreateComposition>[0]> = {}) => ({
  name: "demo",
  projectType: "web",
  stack: {},
  capabilities: [],
  agentMode: "automatic" as const,
  registry,
  ...overrides
});

describe("resolveCreateComposition", () => {
  it("rejects a project type missing from the registry", () => {
    const registry = new Registry([]);

    expect(() => resolveCreateComposition(input(registry))).toThrow('Project type "web" is not available.');
  });

  it("rejects a requested preset missing from the registry", () => {
    const registry = new Registry([projectType("web")]);

    expect(() => resolveCreateComposition(input(registry, { preset: "recommended-web" }))).toThrow(
      'Preset "recommended-web" is not available.'
    );
  });

  it("rejects a preset incompatible with the selected project type", () => {
    const registry = new Registry([
      projectType("web"),
      preset("recommended-api", ["api"], { framework: "express@5" })
    ]);

    expect(() => resolveCreateComposition(input(registry, { preset: "recommended-api" }))).toThrow(
      'Preset "recommended-api" is not compatible with web.'
    );
  });

  it("merges preset stack selections with explicit overrides", () => {
    const registry = new Registry([
      projectType("web"),
      preset("recommended-web", ["web"], {
        framework: "vite@8",
        language: "typescript@5",
        packageManager: "pnpm@10"
      })
    ]);

    const resolution = resolveCreateComposition(
      input(registry, {
        preset: "recommended-web",
        stack: { framework: "nextjs@15" }
      })
    );

    expect(resolution.config.composition).toMatchObject({
      preset: "recommended-web@1.0.0",
      stack: {
        framework: "nextjs@15",
        language: "typescript@5",
        packageManager: "pnpm@10"
      }
    });
  });

  it("keeps the current automatic monorepo agent selection", () => {
    const registry = new Registry([
      projectType("monorepo"),
      capability("auth-custom", ["monorepo"])
    ]);

    const resolution = resolveCreateComposition(
      input(registry, { projectType: "monorepo", authentication: "custom" })
    );

    expect(resolution.config.agents).toEqual({
      mode: "automatic",
      enabled: ["frontend@1.0.0", "backend@1.0.0", "shared@1.0.0", "reviewer@1.0.0"],
      adapters: ["codex"]
    });
  });

  it("returns configuration accepted by the canonical repo config schema", () => {
    const registry = new Registry([
      projectType("web"),
      preset("recommended-web", ["web"], { framework: "vite@8", language: "typescript@5" })
    ]);

    const resolution = resolveCreateComposition(input(registry, { preset: "recommended-web" }));

    expect(() => RepoConfigSchema.parse(resolution.config)).not.toThrow();
  });
});
