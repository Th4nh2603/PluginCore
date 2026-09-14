import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { buildInfo } from "../application/info-service.js";
import { runDoctor } from "../application/doctor-service.js";
import { applyCreatePlan, planCreate } from "../application/create-service.js";
import type { GeneratorRunner } from "../application/generator-runner.js";
import { parseArguments } from "./arguments.js";
import { formatPresetPreview, formatSelectOption, helpText, infoText } from "./presentation.js";
import { loadRegistry } from "../core/registry/registry-loader.js";

export interface CliIo {
  write(line: string): void;
  color?: boolean;
  prompt?: CliPrompt;
  generatorRunner?: GeneratorRunner;
}

export interface CliPrompt {
  input(message: string): Promise<string>;
  select(message: string, choices: readonly { readonly name: string; readonly value: string }[]): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

const defaultRegistryRoot = (): string => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sourceRegistry = path.resolve(directory, "../../registry");
  return existsSync(sourceRegistry) ? sourceRegistry : path.resolve(directory, "../../../registry");
};

const terminalPrompt = (color: boolean): CliPrompt => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return {
    input: (message) => terminal.question(`${message}: `),
    select: async (message, choices) => {
      process.stdout.write(`${message}\n${choices.map((choice, index) => formatSelectOption(index + 1, choice, color)).join("\n")}\n`);
      const answer = await terminal.question("Choose a number: ");
      return choices[Number(answer) - 1]?.value ?? "";
    },
    confirm: async (message) => /^(y|yes)$/i.test(await terminal.question(`${message} [y/N]: `))
  };
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
    const projectType = command.options.get("--type") ?? (interactive === undefined || registry === undefined ? undefined : await interactive.select("Project type", registry.list("project-type").map((item) => ({ name: item.displayName, value: item.id }))));
    const targetDirectory = command.options.get("--target");
    if (name === undefined || typeof projectType !== "string" || (targetDirectory !== undefined && typeof targetDirectory !== "string") || typeof registryRoot !== "string") {
      io.write("Create requires a repository name and project type.");
      return 2;
    }
    const configuredPreset = command.options.get("--preset");
    const compatiblePresets = registry?.list("preset").filter((preset) => {
      const projectTypes = preset.compatibility?.projectTypes;
      return Array.isArray(projectTypes) && projectTypes.includes(projectType);
    }) ?? [];
    let preset = typeof configuredPreset === "string"
      ? configuredPreset
      : interactive === undefined || compatiblePresets.length === 0
        ? undefined
        : await interactive.select("Stack configuration", [
            ...compatiblePresets.map((item) => ({ name: item.displayName, value: item.id })),
            { name: "Custom", value: "" }
          ]) || undefined;
    const selectedPreset = preset === undefined ? undefined : registry?.get("preset", preset);
    if (selectedPreset !== undefined) {
      io.write(formatPresetPreview(selectedPreset, color));
      if (configuredPreset === undefined && command.options.get("--yes") !== true && interactive !== undefined && !await interactive.confirm("Use this recommended stack?")) {
        preset = undefined;
        io.write("Using Custom stack configuration.");
      }
    }
    const plan = await planCreate({ name, projectType, targetDirectory: typeof targetDirectory === "string" ? targetDirectory : path.resolve(process.cwd(), name), registryRoot, ...(preset === undefined ? {} : { preset }), stack: {}, capabilities: [], agentMode: "automatic" });
    io.write(plan.preview);
    if (interactive === undefined && command.options.get("--yes") !== true) {
      io.write("Review the plan and re-run with --yes to create files.");
      return 2;
    }
    await applyCreatePlan(plan, io.generatorRunner);
    io.write(`Created ${plan.targetDirectory}.`);
    if (plan.config.project.type === "monorepo") {
      io.write("Workspaces: apps/web (Vite + React), apps/api (Express), packages/shared (TypeScript).");
      io.write(`Next: cd "${plan.targetDirectory}"`);
      io.write("Then run: pnpm dev");
    }
    return 0;
  }

  io.write(`Unknown command: ${command.value ?? ""}`.trim());
  io.write(helpText());
  return 2;
};
