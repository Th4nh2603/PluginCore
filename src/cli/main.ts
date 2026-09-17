import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { applyCreatePlan, planCreate } from "../application/create-service.js";
import { runDoctor } from "../application/doctor-service.js";
import type { GeneratorRunner } from "../application/generator-runner.js";
import { buildInfo } from "../application/info-service.js";
import { loadRegistry, type Registry } from "../core/registry/registry-loader.js";
import type { ExtensionManifest } from "../core/registry/manifest.js";
import {
  listStackChoices,
  resolveStack,
  type StackResolution,
  type StackSelection
} from "../core/resolver/stack-resolver.js";
import { parseArguments } from "./arguments.js";
import {
  conciseProjectTypeName,
  formatCompositionPreview,
  formatCreateSuccess,
  formatPresetPreview,
  formatPrompt,
  formatSelectOption,
  helpText,
  infoText,
  type PreviewRow,
  type SelectOption
} from "./presentation.js";

export interface CliIo {
  write(line: string): void;
  color?: boolean;
  prompt?: CliPrompt;
  generatorRunner?: GeneratorRunner;
}

export interface CliPrompt {
  input(message: string): Promise<string>;
  select(message: string, choices: readonly SelectOption[]): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

interface CustomSetup {
  readonly stack: Readonly<Record<string, string>>;
  readonly resolution: StackResolution;
  readonly selections: readonly StackSelection[];
  readonly authentication?: string;
  readonly agentMode: "automatic" | "none";
}

const defaultRegistryRoot = (): string => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sourceRegistry = path.resolve(directory, "../../registry");
  return existsSync(sourceRegistry) ? sourceRegistry : path.resolve(directory, "../../../registry");
};

const terminalPrompt = (color: boolean): CliPrompt => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return {
    input: (message) => terminal.question(`${formatPrompt(message, color)}: `),
    select: async (message, choices) => {
      process.stdout.write(`${formatPrompt(message, color)}\n${choices.map((choice, index) => formatSelectOption(index + 1, choice, color)).join("\n")}\n`);
      const answer = await terminal.question(`${formatPrompt("Choose a number", color)}: `);
      return choices[Number(answer) - 1]?.value ?? "";
    },
    confirm: async (message) => /^(y|yes)$/i.test(await terminal.question(`${formatPrompt(message, color)} [y/N]: `))
  };
};

const isCompatible = (manifest: ExtensionManifest, projectType: string): boolean => {
  const projectTypes = manifest.compatibility?.projectTypes;
  return !Array.isArray(projectTypes) || projectTypes.includes(projectType);
};

const referenceId = (reference: string): string => {
  const separator = reference.lastIndexOf("@");
  return separator > 0 ? reference.slice(0, separator) : reference;
};

const resolveStackPreview = (registry: Registry, preset: ExtensionManifest): Readonly<Record<string, string>> => Object.fromEntries(
  Object.entries(preset.selection?.stack ?? {}).map(([category, reference]) => [
    category,
    registry.get("stack-component", referenceId(reference))?.displayName ?? reference
  ])
);

const authenticationCapabilities = (registry: Registry, projectType: string): readonly ExtensionManifest[] =>
  registry.list("capability").filter((capability) => capability.id.startsWith("auth-") && isCompatible(capability, projectType));

const authenticationProvider = (capabilityId: string): string => capabilityId.replace(/^auth-/u, "");

const orderedAuthenticationChoices = (
  capabilities: readonly ExtensionManifest[],
  preferredCapabilityId: string | undefined
): readonly SelectOption[] => {
  const ordered = preferredCapabilityId === undefined
    ? [...capabilities]
    : [
        ...capabilities.filter((capability) => capability.id === preferredCapabilityId),
        ...capabilities.filter((capability) => capability.id !== preferredCapabilityId)
      ];

  return ordered.map((capability) => ({
    name: capability.displayName,
    value: authenticationProvider(capability.id)
  }));
};

const preferredAuthenticationCapability = (preset: ExtensionManifest | undefined): string | undefined =>
  preset?.selection?.capabilities?.find((capability) => capability.startsWith("auth-"));

const collectCustomSetup = async (input: {
  readonly registry: Registry;
  readonly projectType: string;
  readonly prompt: CliPrompt;
  readonly authChoices: readonly SelectOption[];
  readonly configuredAuthentication?: string;
}): Promise<CustomSetup> => {
  const project = input.registry.get("project-type", input.projectType);
  const slots = project?.stack?.slots ?? [];
  const selections: StackSelection[] = [];

  for (const slot of slots) {
    const partial = resolveStack({
      registry: input.registry,
      projectType: input.projectType,
      selections,
      requireComplete: false
    });
    if (partial.entries.some((entry) => entry.slot === slot.id && entry.source === "auto")) continue;

    const choices: SelectOption[] = listStackChoices({
      registry: input.registry,
      projectType: input.projectType,
      slot: slot.id,
      selected: selections
    }).map((component) => ({ name: component.displayName, value: component.id }));

    if (slot.allowNone === true) choices.push({ name: "None", value: "none" });

    const selected = await input.prompt.select(slot.label, choices);
    if (selected === "none") {
      selections.push({ slot: slot.id, componentId: null });
    } else if (selected !== "") {
      selections.push({ slot: slot.id, componentId: selected });
    }
  }

  let authentication = input.configuredAuthentication;
  if (authentication === undefined && input.authChoices.length > 0) {
    const selectedAuthentication = await input.prompt.select("Authentication", [
      ...input.authChoices,
      { name: "None", value: "none" }
    ]);
    authentication = selectedAuthentication === "none" || selectedAuthentication === ""
      ? undefined
      : selectedAuthentication;
  }

  const agentSelection = slots.length === 0
    ? "automatic"
    : await input.prompt.select("Agents", [
        { name: "Automatic", value: "automatic" },
        { name: "None", value: "none" }
      ]);
  const agentMode = agentSelection === "none" ? "none" : "automatic";

  const resolution = resolveStack({
    registry: input.registry,
    projectType: input.projectType,
    selections
  });

  return {
    stack: resolution.stack,
    resolution,
    selections,
    ...(authentication === undefined ? {} : { authentication }),
    agentMode
  };
};

const customPreviewRows = (input: {
  readonly registry: Registry;
  readonly projectType: string;
  readonly setup: CustomSetup;
}): readonly PreviewRow[] => {
  const project = input.registry.get("project-type", input.projectType);
  const slots = project?.stack?.slots ?? [];
  const selectionBySlot = new Map(input.setup.selections.map((selection) => [selection.slot, selection]));
  const entryBySlot = new Map(input.setup.resolution.entries.map((entry) => [entry.slot, entry]));

  const rows: PreviewRow[] = slots.map((slot) => {
    const entry = entryBySlot.get(slot.id);
    if (entry === undefined) return { label: slot.label, value: "None" };

    const component = input.registry.get("stack-component", entry.id);
    const displayName = component?.displayName ?? entry.id;
    const suffix = entry.source === "auto" && entry.reason !== undefined ? ` (auto: ${entry.reason})` : "";
    return { label: slot.label, value: `${displayName}${suffix}` };
  });

  const authentication = input.setup.authentication === undefined
    ? "None"
    : input.registry.get("capability", `auth-${input.setup.authentication}`)?.displayName ?? input.setup.authentication;
  rows.push({ label: "Authentication", value: authentication });
  rows.push({ label: "Agents", value: input.setup.agentMode === "none" ? "None" : "Automatic" });

  void selectionBySlot;
  return rows;
};

export const runCli = async (argv: readonly string[], io: CliIo): Promise<number> => {
  const command = parseArguments(argv);

  if (command.kind === "help") {
    io.write(helpText());
    return 0;
  }

  if (command.kind === "info") {
    io.write(infoText(buildInfo()));
    return 0;
  }

  if (command.kind === "doctor") {
    const report = await runDoctor({ projectRoot: process.cwd() });
    for (const diagnostic of [...report.passed, ...report.warnings, ...report.errors]) io.write(`${diagnostic.severity}: ${diagnostic.message}`);
    return report.errors.length === 0 ? 0 : 1;
  }

  if (command.kind === "create") {
    const color = io.color ?? (process.stdout.isTTY === true && process.env.NO_COLOR === undefined);
    const interactive = io.prompt ?? (process.stdin.isTTY ? terminalPrompt(color) : undefined);
    const name = command.name ?? (interactive === undefined ? undefined : await interactive.input("Repository name"));
    const registryRoot = command.options.get("--registry") ?? defaultRegistryRoot();
    const registry = typeof registryRoot === "string" ? await loadRegistry(registryRoot) : undefined;
    const projectType = command.options.get("--type") ?? (interactive === undefined || registry === undefined
      ? undefined
      : await interactive.select("Project type", registry.list("project-type").map((item) => ({
          name: conciseProjectTypeName(item.displayName),
          value: item.id
        }))));
    const targetDirectory = command.options.get("--target");

    if (name === undefined || typeof projectType !== "string" || (targetDirectory !== undefined && typeof targetDirectory !== "string") || typeof registryRoot !== "string" || registry === undefined) {
      io.write("Create requires a repository name and project type.");
      return 2;
    }

    const configuredPreset = command.options.get("--preset");
    const configuredAuthentication = command.options.get("--auth");
    const compatiblePresets = registry.list("preset").filter((preset) => isCompatible(preset, projectType));
    const recommendedPreset = compatiblePresets[0];
    const authCapabilities = authenticationCapabilities(registry, projectType);
    const preferredAuthCapabilityId = preferredAuthenticationCapability(recommendedPreset);
    const authChoices = orderedAuthenticationChoices(authCapabilities, preferredAuthCapabilityId);

    let preset = typeof configuredPreset === "string" ? configuredPreset : undefined;
    let authentication = typeof configuredAuthentication === "string" ? configuredAuthentication : undefined;
    let stack: Readonly<Record<string, string>> = {};
    let agentMode: "automatic" | "none" = "automatic";
    let customSetup: CustomSetup | undefined;

    if (authentication !== undefined && !authCapabilities.some((capability) => authenticationProvider(capability.id) === authentication)) {
      io.write(`Authentication capability "auth-${authentication}" is not available for ${projectType}.`);
      return 2;
    }

    if (configuredPreset === undefined && interactive !== undefined) {
      const setupChoices: SelectOption[] = [
        ...(recommendedPreset === undefined ? [] : [{ name: "★ Recommended", value: "recommended", tone: "recommended" as const }]),
        { name: "Custom", value: "custom", tone: "custom" }
      ];
      const setup = await interactive.select("Setup", setupChoices);
      preset = setup === "recommended" ? recommendedPreset?.id : undefined;

      if (setup === "custom") {
        const project = registry.get("project-type", projectType);
        if ((project?.stack?.slots?.length ?? 0) > 0) {
          customSetup = await collectCustomSetup({
            registry,
            projectType,
            prompt: interactive,
            authChoices,
            ...(authentication === undefined ? {} : { configuredAuthentication: authentication })
          });
          stack = customSetup.stack;
          authentication = customSetup.authentication;
          agentMode = customSetup.agentMode;
        } else if (authentication === undefined && authChoices.length > 0) {
          const selectedAuthentication = await interactive.select("Authentication", [
            ...authChoices,
            { name: "None", value: "none" }
          ]);
          authentication = selectedAuthentication === "none" || selectedAuthentication === "" ? undefined : selectedAuthentication;
        }
      }
    } else if (interactive === undefined && preset === undefined && authentication === undefined && authChoices.length > 0) {
      authentication = authChoices[0]?.value;
    }

    const target = typeof targetDirectory === "string" ? targetDirectory : path.resolve(process.cwd(), name);
    let selectedPreset = preset === undefined ? undefined : registry.get("preset", preset);
    let plan = await planCreate({
      name,
      projectType,
      targetDirectory: target,
      registryRoot,
      ...(preset === undefined ? {} : { preset }),
      ...(authentication === undefined ? {} : { authentication }),
      stack,
      capabilities: [],
      agentMode
    });

    if (selectedPreset !== undefined) {
      const resolvedAuthentication = plan.config.composition.authentication;
      const authenticationManifest = resolvedAuthentication === undefined
        ? undefined
        : registry.get("capability", `auth-${resolvedAuthentication}`);

      io.write(formatPresetPreview({
        displayName: selectedPreset.displayName,
        selection: { stack: resolveStackPreview(registry, selectedPreset) },
        extraRows: authenticationManifest === undefined
          ? []
          : [{ label: "Authentication", value: authenticationManifest.displayName }]
      }, color));
      io.write(plan.preview);

      if (interactive !== undefined) {
        const installation = await interactive.select("Install stack", [
          { name: "Install", value: "install", tone: "success" },
          { name: "Choose Custom setup", value: "custom", tone: "custom" }
        ]);

        if (installation === "custom") {
          preset = undefined;
          selectedPreset = undefined;
          const project = registry.get("project-type", projectType);
          if ((project?.stack?.slots?.length ?? 0) > 0) {
            customSetup = await collectCustomSetup({
              registry,
              projectType,
              prompt: interactive,
              authChoices,
              ...(authentication === undefined ? {} : { configuredAuthentication: authentication })
            });
            stack = customSetup.stack;
            authentication = customSetup.authentication;
            agentMode = customSetup.agentMode;
          }

          plan = await planCreate({
            name,
            projectType,
            targetDirectory: target,
            registryRoot,
            ...(authentication === undefined ? {} : { authentication }),
            stack,
            capabilities: [],
            agentMode
          });
        } else if (installation !== "install") {
          io.write("Choose Install or Choose Custom setup.");
          return 2;
        }
      }
    }

    if (customSetup !== undefined) {
      const project = registry.get("project-type", projectType);
      io.write(formatCompositionPreview({
        title: `Custom ${conciseProjectTypeName(project?.displayName ?? projectType)}`,
        rows: customPreviewRows({ registry, projectType, setup: customSetup })
      }, color));
      io.write(plan.preview);

      if (interactive !== undefined) {
        const installation = await interactive.select("Install stack", [
          { name: "Install", value: "install", tone: "success" }
        ]);
        if (installation !== "install") {
          io.write("Choose Install.");
          return 2;
        }
      }
    } else if (selectedPreset === undefined) {
      io.write(plan.preview);
    }

    if (interactive === undefined && command.options.get("--yes") !== true) {
      io.write("Review the plan and re-run with --yes to create files.");
      return 2;
    }

    await applyCreatePlan(plan, io.generatorRunner);
    io.write(formatCreateSuccess({ targetDirectory: plan.targetDirectory, projectType: plan.config.project.type }, color));
    return 0;
  }

  io.write(`Unknown command: ${command.value ?? ""}`.trim());
  io.write(helpText());
  return 2;
};
