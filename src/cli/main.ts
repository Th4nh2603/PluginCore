import { buildInfo } from "../application/info-service.js";
import { runDoctor } from "../application/doctor-service.js";
import { applyCreatePlan, planCreate } from "../application/create-service.js";
import { parseArguments } from "./arguments.js";
import { helpText, infoText } from "./presentation.js";

export interface CliIo {
  write(line: string): void;
}

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
    const projectType = command.options.get("--type");
    const targetDirectory = command.options.get("--target");
    const registryRoot = command.options.get("--registry");
    if (command.name === undefined || typeof projectType !== "string" || typeof targetDirectory !== "string" || typeof registryRoot !== "string") {
      io.write("Create requires <name>, --type, --target, and --registry.");
      return 2;
    }
    const plan = await planCreate({ name: command.name, projectType, targetDirectory, registryRoot, stack: {}, capabilities: [], agentMode: "automatic" });
    io.write(plan.preview);
    if (command.options.get("--yes") !== true) {
      io.write("Review the plan and re-run with --yes to create files.");
      return 2;
    }
    await applyCreatePlan(plan);
    io.write(`Created ${plan.targetDirectory}.`);
    return 0;
  }

  io.write(`Unknown command: ${command.value ?? ""}`.trim());
  io.write(helpText());
  return 2;
};
