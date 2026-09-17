import { describe, expect, it } from "vitest";

import {
  formatCompositionPreview,
  formatCreateSuccess,
  formatPresetPreview,
  formatSelectOption
} from "../../src/cli/presentation.js";

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

describe("formatCompositionPreview", () => {
  it("shows exact resolved rows including automatic dependency provenance", () => {
    const preview = formatCompositionPreview({
      title: "Custom Monorepo",
      rows: [
        { label: "Frontend framework", value: "Next.js" },
        { label: "Frontend library", value: "React (auto: required by Next.js)" },
        { label: "Authentication", value: "None" }
      ]
    }, false);

    expect(preview).toContain("Custom Monorepo");
    expect(preview).toContain("Frontend framework: Next.js");
    expect(preview).toContain("Frontend library: React (auto: required by Next.js)");
    expect(preview).toContain("Authentication: None");
  });
});

describe("formatSelectOption", () => {
  it("uses semantic choice colors instead of project-specific accents", () => {
    const web = formatSelectOption(1, { name: "Web", value: "web" }, true);
    const api = formatSelectOption(2, { name: "API", value: "api" }, true);
    const monorepo = formatSelectOption(3, { name: "Monorepo", value: "monorepo" }, true);

    expect(web).toContain("\u001B[96m");
    expect(api).toContain("\u001B[96m");
    expect(monorepo).toContain("\u001B[96m");
    expect(web).not.toContain("\u001B[34m");
    expect(api).not.toContain("\u001B[32m");
    expect(monorepo).not.toContain("\u001B[38;5;208m");

    expect(formatSelectOption(4, { name: "Recommended", value: "recommended", tone: "recommended" }, true)).toContain("\u001B[92m");
    expect(formatSelectOption(5, { name: "Custom", value: "custom", tone: "custom" }, true)).toContain("\u001B[93m");
  });
});

describe("formatCreateSuccess", () => {
  it("confirms dependency installation and shows Monorepo next steps", () => {
    const message = formatCreateSuccess({ targetDirectory: "D:/work/platform", projectType: "monorepo" }, false);

    expect(message).toContain("Project created and dependencies installed.");
    expect(message).toContain('cd "D:/work/platform"');
    expect(message).toContain("pnpm dev");
  });

  it("uses success color when terminal color is enabled", () => {
    expect(formatCreateSuccess({ targetDirectory: "D:/work/demo", projectType: "web" }, true)).toContain("\u001B[92m");
  });
});
