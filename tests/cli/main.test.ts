import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/main.js";

describe("runCli", () => {
  it("prints command help without reading the filesystem", async () => {
    const output: string[] = [];

    const exitCode = await runCli(["--help"], { write: (line) => output.push(line) });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("repo create <name>");
  });

  it("prints the plugin identifier and version", async () => {
    const output: string[] = [];

    const exitCode = await runCli(["info"], { write: (line) => output.push(line) });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("repo-standard");
    expect(output.join("\n")).toContain("0.1.0");
  });
});
