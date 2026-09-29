import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prepareInitialUser, writeInitialUser } from "../../src/application/initial-user.js";

describe("initial user bootstrap", () => {
  it("writes the fixed admin username with only a private scrypt hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-initial-user-"));
    try {
      const account = await prepareInitialUser("long-enough-password", "long-enough-password");
      await writeInitialUser(root, account);
      const file = path.join(root, ".repo-standard", "initial-user.json");
      const content = await readFile(file, "utf8");
      expect(JSON.parse(content)).toMatchObject({ username: "admin", passwordHash: expect.stringMatching(/^[0-9a-f]{32}:[0-9a-f]{128}$/) });
      expect(content).not.toContain("long-enough-password");
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ["short", "short"],
    ["long-enough-password", "different-password"]
  ])("rejects invalid password input", async (password, confirmation) => {
    await expect(prepareInitialUser(password, confirmation)).rejects.toThrow();
  });
});
