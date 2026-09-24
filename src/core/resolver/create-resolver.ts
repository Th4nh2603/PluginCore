import { RepoConfigSchema, type RepoConfig } from "../config/repo-config.js";
import { RepositoryStandardError } from "../errors.js";
import type { Registry } from "../registry/registry-loader.js";
import type { Diagnostic } from "../validation/validation.js";
import { resolveCapabilities, type CapabilitySelection } from "./capability-resolver.js";
import type { SelectedExtension, UnresolvedSelection } from "./contracts.js";

export type CreateAuthenticationProvider = string;

export interface CreateResolutionInput {
  readonly name: string;
  readonly projectType: string;
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly capabilities: readonly { readonly id: string; readonly version: string; readonly configRef?: string }[];
  readonly agentMode: RepoConfig["agents"]["mode"];
  readonly authentication?: CreateAuthenticationProvider;
  readonly registry: Registry;
}

export interface CreateResolutionPlan {
  readonly config: RepoConfig;
  readonly selected: readonly SelectedExtension[];
  readonly unresolved: readonly UnresolvedSelection[];
  readonly diagnostics: readonly Diagnostic[];
}

const monorepoAgentIds = ["frontend@1.0.0", "backend@1.0.0", "shared@1.0.0", "reviewer@1.0.0"] as const;
const authenticationCapabilityPrefix = "auth-";

const selectionId = (selection: string | CapabilitySelection): string =>
  typeof selection === "string" ? selection : selection.id;

export const resolveCreateComposition = (input: CreateResolutionInput): CreateResolutionPlan => {
  const projectType = input.registry.get("project-type", input.projectType);
  if (projectType === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Project type "${input.projectType}" is not available.`);
  }

  const preset = input.preset === undefined ? undefined : input.registry.get("preset", input.preset);
  if (input.preset !== undefined && preset === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Preset "${input.preset}" is not available.`);
  }

  const supportedProjectTypes = preset?.compatibility?.projectTypes;
  if (Array.isArray(supportedProjectTypes) && !supportedProjectTypes.includes(input.projectType)) {
    throw new RepositoryStandardError(
      "CONFIG_INVALID",
      `Preset "${input.preset}" is not compatible with ${input.projectType}.`
    );
  }

  const chosen = new Map<string, string | CapabilitySelection>();
  for (const id of preset?.selection?.capabilities ?? projectType.selection?.capabilities ?? []) chosen.set(id, id);
  for (const capability of input.capabilities) chosen.set(capability.id, capability);
  if (input.authentication !== undefined) {
    for (const id of chosen.keys()) {
      if (id.startsWith(authenticationCapabilityPrefix)) chosen.delete(id);
    }
    const id = `${authenticationCapabilityPrefix}${input.authentication}`;
    chosen.set(id, id);
  }
  const selections = [...chosen.values()];
  const requestedCapabilities = [
    ...selections.filter((selection) => selectionId(selection).startsWith(authenticationCapabilityPrefix)),
    ...selections.filter((selection) => !selectionId(selection).startsWith(authenticationCapabilityPrefix))
  ];

  if (input.projectType === "monorepo" && !requestedCapabilities.some((selection) =>
    selectionId(selection).startsWith(authenticationCapabilityPrefix)
  )) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Monorepo requires an authentication capability.");
  }

  const capabilityResolution = resolveCapabilities({
    registry: input.registry,
    projectType: input.projectType,
    requested: requestedCapabilities
  });

  const authenticationCapabilities = capabilityResolution.capabilities.filter((capability) =>
    capability.id.startsWith(authenticationCapabilityPrefix)
  );
  if (authenticationCapabilities.length > 1) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Select exactly one authentication capability for Monorepo.");
  }
  const authenticationCapability = authenticationCapabilities[0];
  const authentication = authenticationCapability?.id.slice(authenticationCapabilityPrefix.length);

  const candidate = {
    schemaVersion: 1 as const,
    plugin: { id: "repo-standard" as const, version: "0.1.0" },
    project: { name: input.name, type: input.projectType, root: "." },
    composition: {
      ...(preset === undefined ? {} : { preset: `${preset.id}@${preset.version}` }),
      stack: { ...preset?.selection?.stack, ...input.stack },
      ...(authentication === undefined ? {} : { authentication }),
      capabilities: capabilityResolution.capabilities
    },
    agents: input.projectType === "monorepo"
      ? { mode: input.agentMode, enabled: [...monorepoAgentIds], adapters: ["codex"] }
      : { mode: input.agentMode, enabled: [], adapters: [] },
    flows: { defaults: [] },
    standards: { overrides: [] },
    managed: { stateFile: ".repo-standard/managed-state.yaml" }
  };

  let config: RepoConfig;
  try {
    config = RepoConfigSchema.parse(candidate);
  } catch (error) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Invalid resolved repository configuration.", { cause: error });
  }

  const selected: SelectedExtension[] = [
    { kind: projectType.kind, id: projectType.id, version: projectType.version }
  ];
  if (preset !== undefined) selected.push({ kind: preset.kind, id: preset.id, version: preset.version });
  selected.push(...capabilityResolution.selected);

  return { config, selected, unresolved: [], diagnostics: [] };
};
