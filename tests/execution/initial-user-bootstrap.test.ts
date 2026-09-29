import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { prepareInitialUser, writeInitialUser } from "../../src/application/initial-user.js";
import { customBackendFiles, writeLegacyCustomAuthentication } from "../../src/execution/capabilities/auth-custom.js";

interface User { username: string; passwordHash: string }
type Bootstrap = (findUser: (username: string) => Promise<User | undefined>, createUser: (username: string, hash: string) => Promise<unknown>) => Promise<void>;

const loadBootstrap = async (root: string, source: string): Promise<Bootstrap> => {
  const file = path.join(root, "apps", "api", "dist", "auth", "bootstrap.mjs");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return (await import(pathToFileURL(file).href) as { bootstrapInitialUser: Bootstrap }).bootstrapInitialUser;
};

describe("generated initial user bootstrap", () => {
  it("creates once, then removes the one-time file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-bootstrap-success-"));
    try {
      const source = customBackendFiles("api", "fastify", "drizzle")["src/auth/bootstrap.ts"];
      expect(source).toBeDefined();
      const bootstrap = await loadBootstrap(root, source!);
      const account = await prepareInitialUser("long-enough-password", "long-enough-password");
      await writeInitialUser(root, account);
      const created: User[] = [];
      await bootstrap(async () => undefined, async (username, passwordHash) => { created.push({ username, passwordHash }); });
      expect(created).toEqual([{ username: "admin", passwordHash: account.passwordHash }]);
      expect(existsSync(path.join(root, ".repo-standard", "initial-user.json"))).toBe(false);
      await bootstrap(async () => undefined, async () => { throw new Error("must not create twice"); });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("retains the file when DB is unavailable and never changes an existing password", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-bootstrap-retry-"));
    try {
      const bootstrap = await loadBootstrap(root, customBackendFiles("api", "express", "prisma")["src/auth/bootstrap.ts"]!);
      const account = await prepareInitialUser("long-enough-password", "long-enough-password");
      await writeInitialUser(root, account);
      const file = path.join(root, ".repo-standard", "initial-user.json");
      await expect(bootstrap(async () => { throw new Error("database offline"); }, async () => undefined)).rejects.toThrow("database offline");
      expect(existsSync(file)).toBe(true);
      await bootstrap(async () => ({ username: "admin", passwordHash: "other-hash" }), async () => { throw new Error("must not overwrite"); });
      expect(existsSync(file)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("retains a malformed file and resolves the project root from the module", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-bootstrap-invalid-"));
    try {
      const bootstrap = await loadBootstrap(root, customBackendFiles("api", "fastify", "prisma")["src/auth/bootstrap.ts"]!);
      const file = path.join(root, ".repo-standard", "initial-user.json");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "bad json");
      await expect(bootstrap(async () => undefined, async () => undefined)).rejects.toThrow("Invalid initial user bootstrap file");
      expect(await readFile(file, "utf8")).toBe("bad json");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("writes the same bootstrap module in the recommended generator", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-bootstrap-legacy-"));
    try {
      await writeLegacyCustomAuthentication(root, "platform");
      expect(await readFile(path.join(root, "apps/api/src/auth/bootstrap.ts"), "utf8")).toContain("bootstrapInitialUser");
      const server = await readFile(path.join(root, "apps/api/src/server.ts"), "utf8");
      expect(server.indexOf("await bootstrapInitialUser")).toBeLessThan(server.indexOf("app.listen"));
      const passwordSource = await readFile(path.join(root, "apps/api/src/auth/password.ts"), "utf8");
      const moduleFile = path.join(root, "password.mjs");
      await writeFile(moduleFile, ts.transpileModule(passwordSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
      const { verifyPassword } = await import(pathToFileURL(moduleFile).href) as { verifyPassword: (hash: string, password: string) => Promise<boolean> };
      const account = await prepareInitialUser("long-enough-password", "long-enough-password");
      expect(await verifyPassword(account.passwordHash, "long-enough-password")).toBe(true);
      expect(await verifyPassword(account.passwordHash, "wrong-password")).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
