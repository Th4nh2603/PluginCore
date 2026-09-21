import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";

export type GenerationStrategy = "custom" | "monorepo" | "web" | "empty";
type SupportedStack = Record<string, readonly string[]>;

export const hasImplementedGenerator = (projectType: string): boolean =>
  ["empty", "web", "api", "monorepo"].includes(projectType);

// These are extension references, not arbitrary npm version constraints. Only
// catalogue versions implemented by the generators may reach an execution plan.
const references = (id: string, version: string): readonly string[] => [
  `${id}@${version}`, `${id}@${version.split(".").length === 1 ? version + ".0.0" : version + ".0"}`
];
const frontendReferences = [...references("react", "19"), ...references("vue", "3")];
const backendReferences = [...references("express", "5"), ...references("fastify", "5")];
const ormReferences = [...references("prisma", "6"), ...references("drizzle", "0.45")];

const reject = (category: string, reference: string, projectType: string): never => {
  throw new RepositoryStandardError("CONFIG_INVALID", `Unsupported ${category} selection "${reference}" for ${projectType}: no matching generator is implemented. No files were created.`);
};

const assertStack = (config: RepoConfig, supported: SupportedStack): void => {
  for (const [category, reference] of Object.entries(config.composition.stack)) {
    if (!supported[category]?.includes(reference)) reject(category, reference, config.project.type);
  }
};

const selectedReferences = (selection: string | undefined, fallback: string): readonly string[] => {
  const id = selection?.split("@")[0] ?? fallback;
  if (id === "vue") return references("vue", "3");
  if (id === "react") return references("react", "19");
  if (id === "fastify") return references("fastify", "5");
  return references("express", "5");
};

export const selectGenerationStrategy = (config: RepoConfig): GenerationStrategy => {
  const type = config.project.type;
  const stack = config.composition.stack;
  const custom = stack.frontend !== undefined || stack.backend !== undefined;
  const authentication = config.composition.authentication;
  if (authentication !== undefined && (type !== "monorepo" || !["custom", "clerk"].includes(authentication))) {
    reject("authentication", authentication, type);
  }

  if (custom && ["web", "api", "monorepo"].includes(type)) {
    const hasWeb = type !== "api";
    const hasApi = type !== "web";
    const frontend = selectedReferences(stack.frontend, "react");
    const backend = selectedReferences(stack.backend, "express");
    assertStack(config, {
      language: references("typescript", "5"), packageManager: references("pnpm", "10"),
      ...(hasWeb ? { frontend: frontendReferences, ui: frontend, "frontend-library": frontend, "frontend-framework": references("vite", "8") } : {}),
      framework: hasWeb ? references("vite", "8") : backend,
      ...(hasApi ? { backend: backendReferences, "backend-framework": backend, orm: ormReferences, database: references("postgresql", "16") } : {}),
      ...(type === "monorepo" ? { workspace: references("pnpm-workspaces", "10"), "shared-language": references("typescript", "5") } : {})
    });
    return "custom";
  }

  if (type === "monorepo") {
    assertStack(config, {
      workspace: references("pnpm-workspaces", "10"), packageManager: references("pnpm", "10"),
      "frontend-framework": references("vite", "8"), "frontend-library": references("react", "19"),
      "backend-framework": references("express", "5"), "shared-language": references("typescript", "5"),
      language: references("typescript", "5"), testing: references("vitest", "4"),
      orm: references("prisma", "6"), database: references("postgresql", "16")
    });
    return "monorepo";
  }

  if (type === "web" && stack.framework !== undefined) {
    assertStack(config, { framework: references("vite", "8"), ui: references("react", "19"), language: references("typescript", "5"), packageManager: references("pnpm", "10") });
    return "web";
  }

  if (type === "empty" && Object.keys(stack).length === 0) return "empty";
  throw new RepositoryStandardError("CONFIG_INVALID", `Generator not implemented for ${type} with the selected stack. Choose a supported Custom stack. No files were created.`);
};
