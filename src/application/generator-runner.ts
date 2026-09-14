import { spawn } from "node:child_process";

export interface GeneratorRunner {
  run(command: string, args: readonly string[], cwd: string): Promise<void>;
}

export const usesWindowsCommandShell = (command: string, platform = process.platform): boolean => platform === "win32" && command.toLowerCase().endsWith(".cmd");

export const defaultGeneratorRunner: GeneratorRunner = {
  run: (command, args, cwd) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, shell: usesWindowsCommandShell(command), stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? "no exit code"}.`)));
    })
};
