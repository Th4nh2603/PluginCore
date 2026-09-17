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
  formatSelectInstruction,
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
      if (choices.length === 0) return "";

      process.stdout.write(`${formatPrompt(message, color)}\n${choices.map((choice, index) => formatSelectOption(index + 1, choice, color)).join("\n")}\n`);
      while (true) {
        const answer = await terminal.question(`${formatPrompt(formatSelectInstruction(choices.length, color), color)}: `);
        const selectedIndex = Number(answer);
        if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
          return choices[selectedIndex - 1]?.value ?? "";
        }
        process.stdout.write(`Please choose a number from 1 to ${choices.length}.\n`);
      }
    },
    confirm: async (message) => /^(y|yes)$/i.test(await terminal.question(`${formatPrompt(message, color)} [y/N]: `))
  };
};

const selectChoice = async (
  prompt: CliPrompt,
  message: string,
  choices: readonly SelectOption[]
): Promise<string> => {
  if (choices.length === 0) return "";
  if (choices.length === 1) return choices[0]?.value ?? "";

  while (true) {
    const selected = await prompt.select(message, choices);
    if (choices.some((choice) => choice.value === selected)) return selected;
  }
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
  readonly write: (line: string) => void;
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
    const automatic = partial.entries.find((entry) => entry.slot === slot.id && entry.source === "auto");
    if (automatic !== undefined) {
      const component = input.registry.get("stack-component", automatic.id);
      const reason = automatic.reason === undefined ? "" : ` (${automatic.reason})`;
      input.write(`Auto-selected ${slot.label}: ${component?.displayName ?? automatic.id}${reason}`);
      continue;
    }

    const choices: SelectOption[] = listStackChoices({
      registry: input.registry,
      projectType: input.projectType,
      slot: slot.id,
      selected: selections
    }).map((component) => ({ name: component.displayName, value: component.id }));

    if (slot.allowNone === true) choices.push({ name: "None", value: "none" });

    if (choices.length === 1) input.write(`Auto-selected ${slot.label}: ${choices[0]?.name ?? ""}`);
    const selected = await selectChoice(input.prompt, slot.label, choices);
    if (selected === "none") {
      selections.push({ slot: slot.id, componentId: null });
    } else if (selected !== "") {
      selections.push({ slot: slot.id, componentId: selected });
    }
  }

  let authentication = input.configuredAuthentication;
  if (authentication === undefined && input.authChoices.length > 0) {
    const selectedAuthentication = await selectChoice(input.prompt, "Authentication", [
      ...input.authChoices,
      { name: "None", value: "none" }
    ]);
    authentication = selectedAuthentication === "none" || selectedAuthentication === ""
      ? undefined
      : selectedAuthentication;
  }

  const agentSelection = slots.length === 0
    ? "automatic"
    : await selectChoice(input.prompt, "Agents", [
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
    const projectTypeChoices = registry === undefined
      ? []
      : registry.list("project-type").map((item) => ({
          name: conciseProjectTypeName(item.displayName),
          value: item.id
        }));
    const projectType = command.options.get("--type") ?? (interactive === undefined || registry === undefined
      ? undefined
      : await selectChoice(interactive, "Project type", projectTypeChoices));
    const targetDirectory = command.options.get("--target");

    if (name === undefined || typeof projectType !== "string" || (targetDirectory !== undefined && typeof targetDirectory !== "string") || typeof registryRoot !== "string" || registry === undefined) {
      io.write("Create requires a repository name and project type.");
      return 2;
    }

    const configuredPreset = command.options.get("--preset");
    const configuredAuthentication = command.options.get("--auth");
    const fixedAuthentication = typeof configuredAuthentication === "string" ? configuredAuthentication : undefined;
    const compatiblePresets = registry.list("preset").filter((preset) => isCompatible(preset, projectType));
    const recommendedPreset = compatiblePresets[0];
    const authCapabilities = authenticationCapabilities(registry, projectType);
    const preferredAuthCapabilityId = preferredAuthenticationCapability(recommendedPreset);
    const authChoices = orderedAuthenticationChoices(authCapabilities, preferredAuthCapabilityId);

    let preset = typeof configuredPreset === "string" ? configuredPreset : undefined;
    let authentication = fixedAuthentication;
    let stack: Readonly<Record<string, string>> = {};
    let agentMode: "automatic" | "none" = "automatic";
    let customSetup: CustomSetup | undefined;

    if (authentication !== undefined && !authCapabilities.some((capability) => authenticationProvider(capability.id) === authentication)) {
      io.write(`Authentication capability "auth-${authentication}" is not available for ${projectType}.`);
      return 2;
    }

    const collectCustom = async (): Promise<CustomSetup> => {
      const project = registry.get("project-type", projectType);
      io.write(`Custom ${conciseProjectTypeName(project?.displayName ?? projectType)}`);
      return collectCustomSetup({
        registry,
        projectType,
        prompt: interactive as CliPrompt,
        write: io.write,
        authChoices,
        ...(fixedAuthentication === undefined ? {} : { configuredAuthentication: fixedAuthentication })
      });
    };

    if (configuredPreset === undefined && interactive !== undefined) {
      const setupChoices: SelectOption[] = [
        ...(recommendedPreset === undefined ? [] : [{ name: "★ Recommended", value: "recommended", tone: "recommended" as const }]),
        { name: "Custom", value: "custom", tone: "custom" }
      ];
      const setup = await selectChoice(interactive, "Setup", setupChoices);
      preset = setup === "recommended" ? recommendedPreset?.id : undefined;

      if (setup === "custom") {
        const project = registry.get("project-type", projectType);
        if ((project?.stack?.slots?.length ?? 0) > 0) {
          customSetup = await collectCustom();
          stack = customSetup.stack;
          authentication = customSetup.authentication;
          agentMode = customSetup.agentMode;
        } else if (authentication === undefined && authChoices.length > 0) {
          const selectedAuthentication = await selectChoice(interactive, "Authentication", [
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
    const createCurrentPlan = async () => planCreate({
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
    let plan = await createCurrentPlan();

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
        const installation = await selectChoice(interactive, "Stack setup", [
          { name: "Install Recommended stack", value: "install", tone: "success" },
          { name: "Customize stack", value: "custom", tone: "custom" }
        ]);

        if (installation === "custom") {
          preset = undefined;
          selectedPreset = undefined;
          const project = registry.get("project-type", projectType);
          if ((project?.stack?.slots?.length ?? 0) > 0) {
            customSetup = await collectCustom();
            stack = customSetup.stack;
            authentication = customSetup.authentication;
            agentMode = customSetup.agentMode;
          }

          plan = await createCurrentPlan();
        }
      }
    }

    if (customSetup !== undefined) {
      while (true) {
        const project = registry.get("project-type", projectType);
        io.write(formatCompositionPreview({
          title: `Custom ${conciseProjectTypeName(project?.displayName ?? projectType)}`,
          rows: customPreviewRows({ registry, projectType, setup: customSetup })
        }, color));
        io.write(plan.preview);

        if (interactive === undefined) break;

        const installation = await selectChoice(interactive, "Install this stack?", [
          { name: "Install", value: "install", tone: "success" },
          { name: "Edit selections", value: "edit", tone: "custom" },
          { name: "Cancel", value: "cancel" }
        ]);
        if (installation === "install") break;
        if (installation === "cancel") {
          io.write("Creation cancelled.");
          return 2;
        }

        customSetup = await collectCustom();
        stack = customSetup.stack;
        authentication = customSetup.authentication;
        agentMode = customSetup.agentMode;
        plan = await createCurrentPlan();
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
