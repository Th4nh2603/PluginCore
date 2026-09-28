import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("create pipeline boundaries", () => {
  it("keeps provider dispatch and generated source out of Core and Application", async () => {
    const sources = await Promise.all([
      "src/application/create-service.ts",
      "src/core/resolver/create-resolver.ts",
      "src/core/planning/create-planner.ts"
    ].map((file) => readFile(file, "utf8")));
    for (const source of sources) {
      expect(source).not.toMatch(/\b(?:clerk|prisma|express|vite|argon2)\b/iu);
      expect(source).not.toContain("<html");
    }
    expect(sources[0]).not.toContain('startsWith("auth-")');
  });
});
