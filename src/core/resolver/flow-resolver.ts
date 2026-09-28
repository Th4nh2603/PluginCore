import { RepositoryStandardError } from "../errors.js";
import type { ExtensionManifest } from "../registry/manifest.js";
import type { Registry } from "../registry/registry-loader.js";
import { inferIntent } from "./agent-resolver.js";

type FlowStep = NonNullable<ExtensionManifest["flow"]>["steps"][number];

export interface FlowInput {
  readonly registry: Registry;
  readonly projectType: string;
  readonly defaults: readonly string[];
  readonly intent?: string;
  readonly task?: { readonly text: string; readonly targetPaths: readonly string[] };
  readonly selected?: string;
  readonly requiresReview?: boolean;
}

export interface FlowResolution {
  readonly id: string;
  readonly intent: string;
  readonly steps: readonly FlowStep[];
  readonly omitted: readonly { readonly id: string; readonly reason: string }[];
  readonly expertise: readonly string[];
  readonly explanation: readonly string[];
}

const compatible = (manifest: ExtensionManifest, projectType: string): boolean => {
  const projectTypes = manifest.compatibility?.projectTypes;
  return !Array.isArray(projectTypes) || projectTypes.includes(projectType);
};

export const resolveFlow = (input: FlowInput): FlowResolution => {
  if (input.registry.get("project-type", input.projectType) === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Project type "${input.projectType}" is not available.`);
  }
  const intent = input.intent ?? (input.task === undefined ? "feature" : inferIntent(input.task));
  const candidates = input.defaults.length === 0
    ? input.registry.list("flow")
    : input.defaults.map((id) => {
        const manifest = input.registry.get("flow", id);
        if (manifest === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `Configured flow "${id}" is not available.`);
        return manifest;
      });
  const selected = input.selected === undefined
    ? candidates.find((manifest) => compatible(manifest, input.projectType) && manifest.flow?.intents.includes(intent))
    : input.registry.get("flow", input.selected);
  if (selected === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", input.selected === undefined
      ? `No configured flow handles intent "${intent}".` : `Flow "${input.selected}" is not available.`);
  }
  if (!compatible(selected, input.projectType)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Flow "${selected.id}" is not compatible with ${input.projectType}.`);
  }
  const definition = selected.flow;
  if (definition === undefined) throw new RepositoryStandardError("MANIFEST_INVALID", `Flow "${selected.id}" has no definition.`);
  const steps = definition.steps.filter((step) => step.condition !== "policy.requiresReview" || input.requiresReview === true);
  const omitted = definition.steps.filter((step) => !steps.includes(step))
    .map((step) => ({ id: step.id, reason: "Review policy is not required." }));
  const expertise = [...new Set(steps.flatMap((step) => step.expertise))];
  return {
    id: selected.id,
    intent,
    steps,
    omitted,
    expertise,
    explanation: [
      `Flow: ${selected.id} (${input.selected === undefined ? `selected for ${intent}` : "explicit selection"}).`,
      ...omitted.map((step) => `Skipped ${step.id}: ${step.reason}`)
    ]
  };
};
