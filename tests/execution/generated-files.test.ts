import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { listGeneratedFiles } from "../../src/execution/generated-files.js";

it("excludes installed dependency and git internals from managed source output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-generated-files-"));
  try {
    await mkdir(path.join(root, "node_modules", "package"), { recursive: true });
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, "README.md"), "readme");
    await writeFile(path.join(root, "node_modules", "package", "index.js"), "dependency");
    await writeFile(path.join(root, ".git", "config"), "git");
    expect(await listGeneratedFiles(root)).toEqual(["README.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
