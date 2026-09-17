import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const applicationFiles = [
  "create-service.ts",
  "legacy-create-service.ts"
];

const technologyImplementationTerms = /\b(vite|react|express|prisma|clerk|argon2)\b/i;

describe("application architecture boundaries", () => {
  it("keeps framework and provider implementation knowledge out of create application services", async () => {
    for (const file of applicationFiles) {
      const source = await readFile(path.join(process.cwd(), "src", "application", file), "utf8");
      expect(source, file).not.toMatch(technologyImplementationTerms);
    }
  });
});
