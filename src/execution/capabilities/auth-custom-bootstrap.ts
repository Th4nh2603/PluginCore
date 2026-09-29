export const initialUserBootstrapSource = `import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const initialUserPath = path.join(projectRoot, ".repo-standard", "initial-user.json");
const usernamePattern = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/;
const hashPattern = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

interface InitialUser { schemaVersion: 1; username: string; passwordHash: string }
const parseInitialUser = (content: string): InitialUser => {
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { throw new Error("Invalid initial user bootstrap file."); }
  if (typeof value !== "object" || value === null || !("schemaVersion" in value) || value.schemaVersion !== 1 ||
      !("username" in value) || typeof value.username !== "string" || !usernamePattern.test(value.username) ||
      !("passwordHash" in value) || typeof value.passwordHash !== "string" || !hashPattern.test(value.passwordHash)) {
    throw new Error("Invalid initial user bootstrap file.");
  }
  return value as unknown as InitialUser;
};

export const bootstrapInitialUser = async (
  findUser: (username: string) => Promise<unknown>,
  createUser: (username: string, passwordHash: string) => Promise<unknown>
): Promise<void> => {
  let content: string;
  try { content = await readFile(initialUserPath, "utf8"); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  const account = parseInitialUser(content);
  if (await findUser(account.username)) { await unlink(initialUserPath); return; }
  try { await createUser(account.username, account.passwordHash); }
  catch (error) {
    if (await findUser(account.username)) { await unlink(initialUserPath); return; }
    throw error;
  }
  await unlink(initialUserPath);
};
`;
