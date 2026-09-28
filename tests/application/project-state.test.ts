import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createManagedState } from "../../src/application/project-state.js";

const hash = (content: string): string => createHash("sha256").update(content).digest("hex");

describe("createManagedState", () => {
  it("records config and every owned output with stable owner, version and hash", () => {
    const configText = "schemaVersion: 1\n";
    const state = createManagedState(configText, [
      { path: "agents/frontend.toml", owner: "agent:frontend", version: "1.0.0", hash: hash("role") },
      { path: "apps/api/src/auth/router.ts", owner: "capability:auth-custom", version: "1.0.0", hash: hash("router") }
    ]);
    expect(state.files).toEqual([
      { path: "repo.config.yaml", owner: "core", hash: hash(configText) },
      { path: "agents/frontend.toml", owner: "agent:frontend", version: "1.0.0", hash: hash("role") },
      { path: "apps/api/src/auth/router.ts", owner: "capability:auth-custom", version: "1.0.0", hash: hash("router") }
    ]);
  });
});
