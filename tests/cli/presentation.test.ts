import { describe, expect, it } from "vitest";

import { formatCreateSuccess, formatMonorepoReview, formatPresetPreview, formatSelectOption } from "../../src/cli/presentation.js";

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

  it("shows each recommended stack component on its own labeled line", () => {
    const preview = formatPresetPreview(preset, false);

    expect(preview).toContain("Recommended Monorepo");
    expect(preview).toContain("Workspace: pnpm-workspaces@10");
    expect(preview).toMatch(/Frontend Framework: vite@8\nFrontend Library: react@19/u);
    expect(preview).toContain("Backend Framework: express@5");
    expect(preview).toContain("Shared Language: typescript@5");
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
  it("lists every stack component under a recommended preset option", () => {
    const option = formatSelectOption(1, {
      name: "Recommended Monorepo Stack — Vite + React",
      value: "recommended-monorepo",
      tone: "recommended",
      stack: {
        "frontend-framework": "Vite",
        "frontend-library": "React"
      },
      extraRows: [{ label: "Authentication", value: "Custom Authentication" }]
    }, false);

    expect(option).toBe("1. ★ Recommended Monorepo\n  Frontend Framework: Vite\n  Frontend Library: React\n  Authentication: Custom Authentication");
  });

  it("colors recommended preset and stack names pink and stack values green", () => {
    const option = formatSelectOption(1, {
      name: "Recommended Monorepo Stack",
      value: "recommended-monorepo",
      tone: "recommended",
      stack: { "frontend-framework": "Vite", "frontend-library": "React" }
    }, true);

    expect(option).toContain("\u001B[95mRecommended Monorepo\u001B[0m");
    expect(option).toContain("\u001B[95mFrontend Framework\u001B[0m");
    expect(option).toContain("\u001B[92mVite\u001B[0m");
    expect(option).toContain("\u001B[92mReact\u001B[0m");
  });

  it("uses semantic choice colors instead of project-specific accents", () => {
    const web = formatSelectOption(1, { name: "Web", value: "web" }, true);
    const api = formatSelectOption(2, { name: "API", value: "api" }, true);
    const monorepo = formatSelectOption(3, { name: "Monorepo", value: "monorepo" }, true);

    expect(web).toContain("\u001B[95m");
    expect(api).toContain("\u001B[95m");
    expect(monorepo).toContain("\u001B[95m");
    expect(web).not.toContain("\u001B[34m");
    expect(api).not.toContain("\u001B[32m");
    expect(monorepo).not.toContain("\u001B[38;5;208m");

    expect(formatSelectOption(4, { name: "Recommended", value: "recommended", tone: "recommended" }, true)).toContain("\u001B[95m");
    expect(formatSelectOption(5, { name: "Custom", value: "custom", tone: "custom" }, true)).toContain("\u001B[95m");
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

describe("formatMonorepoReview", () => {
  it("shows the edited preset and every choice before Install", () => {
    const review = formatMonorepoReview({
      name: "platform", targetDirectory: "/tmp/platform", startingPoint: "Recommended Monorepo", changed: true,
      frontend: "Vue", backend: "Express", orm: "Prisma", authentication: "Clerk Authentication", mcpEnabled: true
    }, false);

    expect(review).toContain("Starting point: Recommended Monorepo · edited");
    expect(review).toContain("Frontend: Vue");
    expect(review).toContain("Authentication: Clerk Authentication");
    expect(review).toContain("MCP: On");
    expect(review).toContain("Fixed stack: Vite · TypeScript · pnpm workspace · PostgreSQL · Vitest");
    expect(review).toContain("Target: /tmp/platform");
  });
});
