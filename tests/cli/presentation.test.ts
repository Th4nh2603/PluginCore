import { describe, expect, it } from "vitest";

import { formatPresetPreview, formatSelectOption } from "../../src/cli/presentation.js";

describe("formatPresetPreview", () => {
  const preset = {
    displayName: "Recommended Monorepo Stack — pnpm workspace, Vite + React, Express, shared TypeScript",
    selection: {
      stack: {
        workspace: "pnpm-workspaces@10",
        "frontend-framework": "vite@8",
        "frontend-library": "react@19",
        "backend-framework": "express@5",
        "shared-language": "typescript@5",
        testing: "vitest@4"
      }
    }
  };

  it("groups the recommended stack into human-friendly preview rows", () => {
    const preview = formatPresetPreview(preset, false);

    expect(preview).toContain("Recommended Monorepo");
    expect(preview).toContain("Workspace: pnpm-workspaces@10");
    expect(preview).toContain("Frontend: vite@8 + react@19");
    expect(preview).toContain("Backend: express@5");
    expect(preview).toContain("Language: typescript@5");
    expect(preview).toContain("Testing: vitest@4");
  });

  it("adds terminal color when enabled", () => {
    expect(formatPresetPreview(preset, true)).toContain("\u001B[");
  });

  it("keeps output plain when color is disabled", () => {
    expect(formatPresetPreview(preset, false)).not.toContain("\u001B[");
  });
});

describe("formatSelectOption", () => {
  it("uses semantic choice colors instead of project-specific accents", () => {
    const web = formatSelectOption(1, { name: "Web", value: "web" }, true);
    const api = formatSelectOption(2, { name: "API", value: "api" }, true);
    const monorepo = formatSelectOption(3, { name: "Monorepo", value: "monorepo" }, true);

    expect(web).toContain("\u001B[97m");
    expect(api).toContain("\u001B[97m");
    expect(monorepo).toContain("\u001B[97m");
    expect(web).not.toContain("\u001B[34m");
    expect(api).not.toContain("\u001B[32m");
    expect(monorepo).not.toContain("\u001B[38;5;208m");
  });
});
