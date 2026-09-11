import { buildInfo } from "../application/info-service.js";
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

  io.write(`Unknown command: ${command.value ?? ""}`.trim());
  io.write(helpText());
  return 2;
};
