export interface InitialUser {
  readonly username: string;
  readonly passwordHash: string;
}

export class InitialUserValidationError extends Error {}

export const prepareInitialUser = async (password: string, confirmation: string): Promise<InitialUser> => {
  if (password.length < 12 || password.length > 128) throw new InitialUserValidationError("Password must contain 12–128 characters.");
  if (password !== confirmation) throw new InitialUserValidationError("Password confirmation does not match.");
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { username: "admin", passwordHash: `${salt}:${hash.toString("hex")}` };
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
