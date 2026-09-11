import { buildInfo } from "../application/info-service.js";
import { runDoctor } from "../application/doctor-service.js";
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

  io.write(`Unknown command: ${command.value ?? ""}`.trim());
  io.write(helpText());
  return 2;
};
