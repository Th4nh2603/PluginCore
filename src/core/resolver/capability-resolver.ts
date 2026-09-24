import { RepositoryStandardError } from "../errors.js";
import type { Registry } from "../registry/registry-loader.js";
import type { SelectedExtension } from "./contracts.js";

export interface CapabilitySelection {
  readonly id: string;
  readonly version?: string;
  readonly configRef?: string;
}

export interface ResolvedCapability {
  readonly id: string;
  readonly version: string;
  readonly configRef?: string;
}

export interface CapabilityResolutionInput {
  readonly registry: Registry;
  readonly projectType: string;
  readonly requested: readonly (string | CapabilitySelection)[];
}

export interface CapabilityResolution {
  readonly capabilities: readonly ResolvedCapability[];
  readonly selected: readonly SelectedExtension[];
}

const capabilityId = (selection: string | CapabilitySelection): string =>
  typeof selection === "string" ? selection : selection.id;

export const resolveCapabilities = (input: CapabilityResolutionInput): CapabilityResolution => {
  const capabilities: ResolvedCapability[] = [];
  const selected: SelectedExtension[] = [];
  const resolved = new Set<string>();
  const resolving = new Set<string>();
  const requestedById = new Map(
    input.requested.map((selection) => [capabilityId(selection), selection] as const)
  );

  const resolveOne = (id: string): void => {
    if (resolved.has(id)) return;
    if (resolving.has(id)) {
      throw new RepositoryStandardError("CONFIG_INVALID", `Capability dependency cycle detected at "${id}".`);
    }

    const manifest = input.registry.get("capability", id);
    if (manifest === undefined) {
      throw new RepositoryStandardError("CONFIG_INVALID", `Capability "${id}" is not available.`);
    }

    const requested = requestedById.get(id);
    if (typeof requested === "object" && requested.version !== undefined && requested.version !== manifest.version) {
      throw new RepositoryStandardError("CONFIG_INVALID", `Capability "${id}" version ${requested.version} is not available.`);
    }

    const supportedProjectTypes = manifest.compatibility?.projectTypes;
    if (Array.isArray(supportedProjectTypes) && !supportedProjectTypes.includes(input.projectType)) {
      throw new RepositoryStandardError(
        "CONFIG_INVALID",
        `Capability "${id}" is not compatible with ${input.projectType}.`
      );
    }

    resolving.add(id);
    for (const dependency of manifest.dependencies ?? []) resolveOne(dependency);
    resolving.delete(id);

    const configRef = typeof requested === "object" ? requested.configRef : undefined;
    capabilities.push({
      id: manifest.id,
      version: manifest.version,
      ...(configRef === undefined ? {} : { configRef })
    });
    selected.push({ kind: manifest.kind, id: manifest.id, version: manifest.version });
    resolved.add(id);
  };

  for (const selection of input.requested) resolveOne(capabilityId(selection));

  return { capabilities, selected };
};
