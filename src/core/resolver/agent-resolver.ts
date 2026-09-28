import { RepositoryStandardError } from "../errors.js";
import type { ExtensionManifest } from "../registry/manifest.js";
import type { Registry } from "../registry/registry-loader.js";

export type AgentMode = "automatic" | "recommended" | "custom" | "none";

export interface AgentTaskContext {
  readonly intent?: string;
  readonly targetPaths: readonly string[];
  readonly text: string;
}

export interface AgentResolutionInput {
  readonly registry: Registry;
  readonly projectType: string;
  readonly mode: AgentMode;
  readonly selected?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly requiredExpertise?: readonly string[];
  readonly task?: AgentTaskContext;
}

export interface ResolvedAgent {
  readonly id: string;
  readonly version: string;
  readonly reason: string;
  readonly required: boolean;
  readonly manifest: ExtensionManifest;
}

export interface AgentResolution {
  readonly projectType: string;
  readonly enabled: readonly ResolvedAgent[];
  readonly recommended: readonly ResolvedAgent[];
  readonly explanation: readonly string[];
  readonly taskIntent?: string;
}

export const inferIntent = (task: AgentTaskContext): string => {
  if (task.intent !== undefined) return task.intent;
  const text = task.text.toLowerCase();
  const terms: readonly [string, RegExp, number][] = [
    ["review", /\b(review|audit)\b/iu, 4],
    ["security", /\b(security|vulnerability)\b/iu, 4],
    ["bugfix", /\b(fix|bug|broken|regression)\b/iu, 3],
    ["design", /\b(design|architecture)\b/iu, 3],
    ["refactor", /\b(refactor|cleanup)\b/iu, 3],
    ["test", /\b(test|coverage|verify)\b/iu, 2]
  ];
  const scores = new Map<string, number>(terms.map(([intent, pattern, weight]) => [intent, pattern.test(text) ? weight : 0]));
  if (task.targetPaths.some((target) => /(^|\/)tests?\/|\.test\.[cm]?[jt]sx?$/iu.test(target))) {
    scores.set("test", (scores.get("test") ?? 0) + 1);
  }
  const ranked = [...scores].sort((left, right) => right[1] - left[1]);
  return ranked[0]?.[1] ? ranked[0][0] : "feature";
};

const isCompatible = (manifest: ExtensionManifest, projectType: string): boolean => {
  const projectTypes = manifest.compatibility?.projectTypes;
  return !Array.isArray(projectTypes) || projectTypes.includes(projectType);
};

const hasSignal = (manifest: ExtensionManifest, task: AgentTaskContext): boolean => {
  const context = `${task.text} ${task.targetPaths.join(" ")}`.toLowerCase();
  return manifest.agent?.signals.some((signal) => {
    const escaped = signal.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "u").test(context);
  }) ?? false;
};

const ownsTarget = (manifest: ExtensionManifest, task: AgentTaskContext, projectType: string): boolean =>
  (manifest.agent?.ownsByProjectType?.[projectType] ?? manifest.agent?.owns ?? [])
    .some((owned) => task.targetPaths.some((target) => target === owned || target.startsWith(`${owned}/`)));

export const resolveAgents = (input: AgentResolutionInput): AgentResolution => {
  const project = input.registry.get("project-type", input.projectType);
  if (project === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `Project type "${input.projectType}" is not available.`);

  const selected = new Set(input.selected ?? []);
  const task = input.task === undefined ? undefined : { ...input.task, intent: inferIntent(input.task) };
  const defaultIds = project.agentHints?.recommended ?? [];
  const requiredIds = new Set(project.agentHints?.required ?? []);
  const flowRequiredIds = new Set<string>();
  for (const expertise of input.requiredExpertise ?? []) {
    const candidate = input.registry.list("agent").find((manifest) =>
      isCompatible(manifest, input.projectType) && manifest.agent?.expertise.includes(expertise) &&
      (expertise === "review" || manifest.agent.reviewOnly === false) &&
      (manifest.id === expertise || manifest.id === `${expertise}er`)
    ) ?? input.registry.list("agent").find((manifest) =>
      isCompatible(manifest, input.projectType) && manifest.agent?.expertise.includes(expertise) &&
      (expertise === "review" || manifest.agent.reviewOnly === false)
    );
    if (candidate === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `No compatible agent covers flow expertise "${expertise}".`);
    requiredIds.add(candidate.id);
    flowRequiredIds.add(candidate.id);
  }
  for (const capabilityId of input.capabilities ?? []) {
    const capability = input.registry.get("capability", capabilityId);
    if (capability === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `Capability "${capabilityId}" is not available.`);
    for (const id of capability.agentHints?.required ?? []) requiredIds.add(id);
  }

  const candidates = input.registry.list("agent").filter((manifest) => isCompatible(manifest, input.projectType));
  const ids = task === undefined
    ? [...new Set([...defaultIds, ...requiredIds, ...selected])]
    : [...new Set([
        ...defaultIds.filter((id) => {
          const manifest = input.registry.get("agent", id);
          return manifest !== undefined && (ownsTarget(manifest, task, input.projectType) || hasSignal(manifest, task));
        }),
        ...candidates.filter((manifest) => manifest.agent !== undefined && (
          ownsTarget(manifest, task, input.projectType) || hasSignal(manifest, task) ||
          (manifest.agent.owns.length === 0 && manifest.agent.intents.includes(task.intent) && ["review", "design", "security"].includes(task.intent))
        )).map((manifest) => manifest.id),
        ...requiredIds,
        ...selected
      ])];

  if (task !== undefined) {
    for (const id of ids) {
      const manifest = input.registry.get("agent", id);
      if (manifest?.agent?.requiredOnSignal && hasSignal(manifest, task)) requiredIds.add(id);
    }
  }

  const resolved = ids.map((id): ResolvedAgent => {
    const manifest = input.registry.get("agent", id);
    if (manifest === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `Agent "${id}" is not available.`);
    if (!isCompatible(manifest, input.projectType)) throw new RepositoryStandardError("CONFIG_INVALID", `Agent "${id}" is not compatible with ${input.projectType}.`);
    const reason = flowRequiredIds.has(id) ? "Required by the selected flow."
      : task !== undefined && ownsTarget(manifest, task, input.projectType)
        ? `Owns a target path for ${task.intent}.`
        : task !== undefined && hasSignal(manifest, task)
        ? `Matches a ${task.intent} task signal.`
          : requiredIds.has(id) ? "Required by project or capability metadata."
          : selected.has(id) ? "Selected explicitly." : "Recommended by project metadata.";
    return { id, version: manifest.version, reason, required: requiredIds.has(id), manifest };
  });

  const recommendedIds = new Set(resolved.map((agent) => agent.id));
  if (task !== undefined) {
    for (const agent of resolved) {
      for (const id of agent.manifest.agentHints?.recommended ?? []) recommendedIds.add(id);
    }
  }
  const recommended = [...recommendedIds].map((id) => resolved.find((agent) => agent.id === id) ?? (() => {
    const manifest = input.registry.get("agent", id);
    if (manifest === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `Agent "${id}" is not available.`);
    return { id, version: manifest.version, reason: `Recommended by a selected agent.`, required: false, manifest };
  })());

  const enabled = input.mode === "none"
    ? resolved.filter((agent) => agent.required)
    : input.mode === "custom"
      ? resolved.filter((agent) => agent.required || selected.has(agent.id))
      : resolved;
  for (const agent of enabled) {
    if (agent.manifest.agent === undefined) {
      throw new RepositoryStandardError("MANIFEST_INVALID", `Agent "${agent.id}" has no rendering metadata.`);
    }
  }
  return {
    projectType: input.projectType,
    enabled,
    recommended,
    explanation: [
      ...(task === undefined ? [] : [`Intent: ${task.intent}${input.task?.intent === undefined ? " (inferred from task context)" : " (explicit)"}.`]),
      ...enabled.map((agent) => `${agent.id}: ${agent.reason}`)
    ],
    ...(task === undefined ? {} : { taskIntent: task.intent })
  };
};
