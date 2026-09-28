import { readdir } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set(["node_modules", ".git", ".repo-standard", "dist", "coverage"]);

export const listGeneratedFiles = async (directory: string, root = directory): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : listGeneratedFiles(entryPath, root);
    return entry.isFile() ? [path.relative(root, entryPath).split(path.sep).join("/")] : [];
  }));
  return files.flat().sort();
};
