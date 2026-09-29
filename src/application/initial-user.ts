export interface InitialUser {
  readonly username: string;
  readonly passwordHash: string;
}

export const prepareInitialUser = async (username: string, password: string, confirmation: string): Promise<InitialUser> => {
  const normalized = username.trim().toLowerCase();
  if (!validUsername.test(normalized)) throw new Error("Username must use 3–32 letters, numbers, underscores, or internal hyphens.");
  if (password.length < 12 || password.length > 128) throw new Error("Password must contain 12–128 characters.");
  if (password !== confirmation) throw new Error("Password confirmation does not match.");
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { username: normalized, passwordHash: `${salt}:${hash.toString("hex")}` };
};

export const writeInitialUser = async (targetDirectory: string, account: InitialUser): Promise<void> => {
  const directory = path.join(targetDirectory, ".repo-standard");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "initial-user.json"), `${JSON.stringify({ schemaVersion: 1, ...account })}\n`, {
    encoding: "utf8", mode: 0o600, flag: "wx"
  });
};
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const validUsername = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/;
