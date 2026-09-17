import { RepositoryStandardError } from "../errors.js";
import type { ExtensionManifest, StackSlotDefinition } from "../registry/manifest.js";
import type { Registry } from "../registry/registry-loader.js";

export interface StackSelection {
  readonly slot: string;
  readonly componentId?: string | null;
}

export interface ResolvedStackEntry {
  readonly slot: string;
  readonly id: string;
  readonly version: string;
  readonly source: "user" | "auto";
  readonly reason?: string;
}

export interface StackResolution {
  readonly stack: Readonly<Record<string, string>>;
  readonly entries: readonly ResolvedStackEntry[];
}

interface StackContextInput {
  readonly registry: Registry;
  readonly projectType: string;
}

export interface ListStackChoicesInput extends StackContextInput {
  readonly slot: string;
  readonly selected: readonly StackSelection[];
}

export interface ResolveStackInput extends StackContextInput {
  readonly selections: readonly StackSelection[];
  readonly requireComplete?: boolean;
}

const configurationError = (message: string): RepositoryStandardError =>
  new RepositoryStandardError("CONFIG_INVALID", message);

const projectSlots = (registry: Registry, projectType: string): readonly StackSlotDefinition[] => {
  const project = registry.get("project-type", projectType);
  if (project === undefined) throw configurationError(`Project type "${projectType}" is not available.`);
  return project.stack?.slots ?? [];
};

const supportsProjectType = (component: ExtensionManifest, projectType: string): boolean => {
  const supported = component.compatibility?.projectTypes;
  return !Array.isArray(supported) || supported.includes(projectType);
};

const getStackComponent = (registry: Registry, componentId: string): ExtensionManifest => {
  const component = registry.get("stack-component", componentId);
  if (component === undefined) throw configurationError(`Stack component "${componentId}" is not available.`);
  if (component.stack?.slot === undefined) {
    throw configurationError(`Stack component "${componentId}" does not declare a stack slot.`);
  }
  return component;
};

const compatiblePair = (left: ExtensionManifest, right: ExtensionManifest): boolean => {
  const rightSlot = right.stack?.slot;
  const leftSlot = left.stack?.slot;
  if (rightSlot === undefined || leftSlot === undefined) return false;

  const leftAllowed = left.stack?.compatibleWith?.[rightSlot];
  if (leftAllowed !== undefined && !leftAllowed.includes(right.id)) return false;

  const rightAllowed = right.stack?.compatibleWith?.[leftSlot];
  return rightAllowed === undefined || rightAllowed.includes(left.id);
};

const selectedComponents = (registry: Registry, projectType: string, selected: readonly StackSelection[]): readonly ExtensionManifest[] =>
  selected.flatMap((selection) => {
    if (selection.componentId === undefined || selection.componentId === null) return [];
    const component = getStackComponent(registry, selection.componentId);
    if (component.stack?.slot !== selection.slot) {
      throw configurationError(`Stack component "${component.id}" belongs to slot "${component.stack?.slot}", not "${selection.slot}".`);
    }
    if (!supportsProjectType(component, projectType)) {
      throw configurationError(`Stack component "${component.id}" is not compatible with ${projectType}.`);
    }
    return [component];
  });

export const listStackChoices = (input: ListStackChoicesInput): readonly ExtensionManifest[] => {
  const slots = projectSlots(input.registry, input.projectType);
  if (!slots.some((slot) => slot.id === input.slot)) {
    throw configurationError(`Stack slot "${input.slot}" is not defined for ${input.projectType}.`);
  }

  const selected = selectedComponents(input.registry, input.projectType, input.selected);

  return input.registry.list("stack-component").filter((candidate) =>
    candidate.stack?.slot === input.slot
    && supportsProjectType(candidate, input.projectType)
    && selected.every((selection) => compatiblePair(selection, candidate))
  );
};

export const resolveStack = (input: ResolveStackInput): StackResolution => {
  const slots = projectSlots(input.registry, input.projectType);
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const resolved = new Map<string, ResolvedStackEntry>();
  const explicitNone = new Set<string>();

  for (const selection of input.selections) {
    if (!slotById.has(selection.slot)) {
      throw configurationError(`Stack slot "${selection.slot}" is not defined for ${input.projectType}.`);
    }
    if (selection.componentId === undefined) continue;
    if (selection.componentId === null) {
      explicitNone.add(selection.slot);
      continue;
    }

    const component = getStackComponent(input.registry, selection.componentId);
    if (component.stack?.slot !== selection.slot) {
      throw configurationError(`Stack component "${component.id}" belongs to slot "${component.stack?.slot}", not "${selection.slot}".`);
    }
    if (!supportsProjectType(component, input.projectType)) {
      throw configurationError(`Stack component "${component.id}" is not compatible with ${input.projectType}.`);
    }

    const existing = resolved.get(selection.slot);
    if (existing !== undefined && existing.id !== component.id) {
      throw configurationError(`Stack slot "${selection.slot}" has conflicting selections "${existing.id}" and "${component.id}".`);
    }

    resolved.set(selection.slot, {
      slot: selection.slot,
      id: component.id,
      version: component.version,
      source: "user"
    });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (component: ExtensionManifest): void => {
    if (visiting.has(component.id)) {
      throw configurationError(`Stack dependency cycle detected at "${component.id}".`);
    }
    if (visited.has(component.id)) return;

    visiting.add(component.id);
    for (const dependencyId of component.dependencies ?? []) {
      const dependency = input.registry.get("stack-component", dependencyId);
      if (dependency === undefined) continue;
      const dependencySlot = dependency.stack?.slot;
      if (dependencySlot === undefined) {
        throw configurationError(`Stack component "${dependency.id}" does not declare a stack slot.`);
      }
      if (!supportsProjectType(dependency, input.projectType)) {
        throw configurationError(`Stack component "${component.id}" requires "${dependency.id}", which is not compatible with ${input.projectType}.`);
      }
      if (explicitNone.has(dependencySlot)) {
        throw configurationError(
          `Stack component "${component.id}" requires "${dependency.id}" in "${dependencySlot}", but None was selected.`
        );
      }

      const existing = resolved.get(dependencySlot);
      if (existing !== undefined && existing.id !== dependency.id) {
        throw configurationError(
          `Stack component "${component.id}" requires "${dependency.id}" in "${dependencySlot}", but "${existing.id}" was selected.`
        );
      }

      if (existing === undefined) {
        resolved.set(dependencySlot, {
          slot: dependencySlot,
          id: dependency.id,
          version: dependency.version,
          source: "auto",
          reason: `required by ${component.displayName}`
        });
      }

      visit(dependency);
    }
    visiting.delete(component.id);
    visited.add(component.id);
  };

  for (const entry of [...resolved.values()]) visit(getStackComponent(input.registry, entry.id));

  if (input.requireComplete !== false) {
    for (const slot of slots) {
      if (slot.required === true && !resolved.has(slot.id)) {
        throw configurationError(`Required stack slot "${slot.id}" has no selection.`);
      }
    }
  }

  for (const entry of resolved.values()) {
    const component = getStackComponent(input.registry, entry.id);
    for (const [targetSlot, allowed] of Object.entries(component.stack?.compatibleWith ?? {})) {
      const target = resolved.get(targetSlot);
      if (target !== undefined && !allowed.includes(target.id)) {
        throw configurationError(`Stack component "${component.id}" is not compatible with ${targetSlot} "${target.id}".`);
      }
    }
  }

  const entries = slots.flatMap((slot) => {
    const entry = resolved.get(slot.id);
    return entry === undefined ? [] : [entry];
  });

  return {
    stack: Object.fromEntries(entries.map((entry) => [entry.slot, `${entry.id}@${entry.version}`])),
    entries
  };
};
