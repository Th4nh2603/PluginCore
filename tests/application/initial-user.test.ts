import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prepareInitialUser, writeInitialUser } from "../../src/application/initial-user.js";

describe("initial user bootstrap", () => {
  it("normalizes the username and writes only a private scrypt hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-initial-user-"));
    try {
      const account = await prepareInitialUser("Alice_1", "long-enough-password", "long-enough-password");
      await writeInitialUser(root, account);
      const file = path.join(root, ".repo-standard", "initial-user.json");
      const content = await readFile(file, "utf8");
      expect(JSON.parse(content)).toMatchObject({ username: "alice_1", passwordHash: expect.stringMatching(/^[0-9a-f]{32}:[0-9a-f]{128}$/) });
      expect(content).not.toContain("long-enough-password");
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    ["ab", "long-enough-password", "long-enough-password"],
    ["alice", "short", "short"],
    ["alice", "long-enough-password", "different-password"]
  ])("rejects invalid account input", async (username, password, confirmation) => {
    await expect(prepareInitialUser(username, password, confirmation)).rejects.toThrow();
  });
});
