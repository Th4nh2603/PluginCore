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
import { hasImplementedGenerator } from "../execution/generation-contract.js";
import { parseArguments } from "./arguments.js";
import { selectCustomStack } from "./custom-setup.js";
import {
  conciseProjectTypeName,
  formatCreateSuccess,
  formatPresetPreview,
  formatPrompt,
  formatSelectOption,
  formatWarning,
  helpText,
  infoText,
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

const defaultRegistryRoot = (): string => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sourceRegistry = path.resolve(directory, "../../registry");
  return existsSync(sourceRegistry) ? sourceRegistry : path.resolve(directory, "../../../registry");
};

const terminalPrompt = (color: boolean): CliPrompt & { close(): void } => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return {
    close: () => terminal.close(),
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

const runCommand = async (argv: readonly string[], io: CliIo): Promise<number> => {
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
    const interactive = io.prompt;
    const name = command.name ?? (interactive === undefined ? undefined : await interactive.input("Repository name"));
    const registryRoot = command.options.get("--registry") ?? defaultRegistryRoot();
    const registry = typeof registryRoot === "string" ? await loadRegistry(registryRoot) : undefined;
    const projectType = command.options.get("--type") ?? (interactive === undefined || registry === undefined
      ? undefined
      : await interactive.select("Project type", registry.list("project-type").filter((item) => hasImplementedGenerator(item.id)).map((item) => ({
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
    let stack: Record<string, string> = {};
    const chooseCustom = async (): Promise<boolean> => {
      if (interactive === undefined) return true;
      const selection = await selectCustomStack(registry, projectType, interactive);
      if (selection === undefined) {
        io.write(formatWarning("Choose a valid stack option.", color));
        return false;
      }
      stack = selection;
      if (authentication === undefined && authChoices.length > 0) {
        authentication = await interactive.select("Authentication", authChoices);
        if (!authChoices.some((choice) => choice.value === authentication)) {
          io.write(formatWarning("Choose a valid authentication option.", color));
          return false;
        }
      }
      return true;
    };

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
      if (!setupChoices.some((choice) => choice.value === setup)) {
        io.write(formatWarning("Choose Recommended or Custom.", color));
        return 2;
      }
      if (setup === "recommended") {
        const presetChoices: SelectOption[] = compatiblePresets.map((item) => ({
          name: item.displayName,
          value: item.id,
          tone: "recommended"
        }));
        const selectedPreset = await interactive.select("Recommended preset", presetChoices);
        if (!presetChoices.some((choice) => choice.value === selectedPreset)) {
          io.write(formatWarning("Choose a valid recommended preset.", color));
          return 2;
        }
        preset = selectedPreset;
      }

      if (setup === "custom" && !await chooseCustom()) return 2;
    } else if (interactive === undefined && preset === undefined && authentication === undefined && authChoices.length > 0) {
      authentication = authChoices[0]?.value;
    }

    const target = typeof targetDirectory === "string" ? targetDirectory : path.resolve(process.cwd(), name);
    const selectedPreset = preset === undefined ? undefined : registry.get("preset", preset);
    let plan = await planCreate({
      name,
      projectType,
      targetDirectory: target,
      registryRoot,
      ...(preset === undefined ? {} : { preset }),
      ...(authentication === undefined ? {} : { authentication }),
      stack,
      capabilities: [],
      agentMode: "automatic"
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
          if (!await chooseCustom()) return 2;
          plan = await planCreate({
            name,
            projectType,
            targetDirectory: target,
            registryRoot,
            ...(authentication === undefined ? {} : { authentication }),
            stack,
            capabilities: [],
            agentMode: "automatic"
          });
        } else if (installation !== "install") {
          io.write(formatWarning("Choose Install or Choose Custom setup.", color));
          return 2;
        }
      }
    }

    if (preset === undefined) {
      if (Object.keys(stack).length > 0) {
        io.write(formatPresetPreview({
          displayName: "Custom Stack",
          selection: { stack: Object.fromEntries(Object.entries(stack).map(([category, reference]) => [
            category, registry.get("stack-component", referenceId(reference))?.displayName ?? reference
          ])) },
          extraRows: authentication === undefined ? [] : [{ label: "Authentication", value: authentication }]
        }, color));
      }
      io.write(plan.preview);
      if (interactive !== undefined && Object.keys(stack).length > 0) {
        const installation = await interactive.select("Install stack", [
          { name: "Install", value: "install", tone: "success" },
          { name: "Cancel", value: "cancel" }
        ]);
        if (installation !== "install") {
          io.write(formatWarning("Creation cancelled. No files were written.", color));
          return 2;
        }
      }
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

export const runCli = async (argv: readonly string[], io: CliIo): Promise<number> => {
  const color = process.env.NO_COLOR === undefined && (io.color ?? process.stdout.isTTY === true);
  const prompt = argv[0] === "create" && io.prompt === undefined && process.stdin.isTTY
    ? terminalPrompt(color)
    : undefined;
  try { return await runCommand(argv, { ...io, color, ...(prompt === undefined ? {} : { prompt }) }); }
  finally { prompt?.close(); }
};
