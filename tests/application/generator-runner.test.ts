import { describe, expect, it } from "vitest";

import { usesWindowsCommandShell } from "../../src/application/generator-runner.js";

describe("usesWindowsCommandShell", () => {
  it("uses the command shell for Windows command scripts", () => {
    expect(usesWindowsCommandShell("pnpm.cmd", "win32")).toBe(true);
  });

  it("keeps direct execution for non-script commands and other platforms", () => {
    expect(usesWindowsCommandShell("pnpm", "win32")).toBe(false);
    expect(usesWindowsCommandShell("pnpm.cmd", "linux")).toBe(false);
  });
});
