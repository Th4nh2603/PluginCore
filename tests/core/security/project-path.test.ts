import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveProjectPath } from "../../../src/core/security/project-path.js";

const projectRoot = path.join(process.cwd(), "tests", "tmp", "demo");

describe("resolveProjectPath", () => {
  it("allows a child path", () => {
    expect(resolveProjectPath(projectRoot, ".repo-standard/state.yaml")).toBe(
      path.join(projectRoot, ".repo-standard", "state.yaml")
    );
  });

  it("rejects traversal outside the root", () => {
    expect(() => resolveProjectPath(projectRoot, "../secrets.txt")).toThrow(
      /outside the project root/i
    );
  });
});
