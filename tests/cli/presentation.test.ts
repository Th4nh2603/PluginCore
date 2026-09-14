import { describe, expect, it } from "vitest";

import { formatPresetPreview, formatSelectOption } from "../../src/cli/presentation.js";

describe("formatPresetPreview", () => {
  const preset = {
    displayName: "Recommended Web Stack",
    selection: { stack: { framework: "vite@8", testing: "vitest@4" } }
  };

  it("adds terminal color when enabled", () => {
    expect(formatPresetPreview(preset, true)).toContain("\u001B[");
  });

  it("keeps output plain when color is disabled", () => {
    expect(formatPresetPreview(preset, false)).toContain("Framework: vite@8");
    expect(formatPresetPreview(preset, false)).not.toContain("\u001B[");
  });
});

describe("formatSelectOption", () => {
  it("uses a distinct accent for each built-in project type", () => {
    expect(formatSelectOption(1, { name: "Web Application", value: "web" }, true)).toContain("\u001B[34m");
    expect(formatSelectOption(2, { name: "API", value: "api" }, true)).toContain("\u001B[32m");
    expect(formatSelectOption(3, { name: "CLI", value: "cli" }, true)).toContain("\u001B[33m");
    expect(formatSelectOption(4, { name: "Library", value: "library" }, true)).toContain("\u001B[35m");
    expect(formatSelectOption(5, { name: "Monorepo", value: "monorepo" }, true)).toContain("\u001B[38;5;208m");
    expect(formatSelectOption(6, { name: "Empty", value: "empty" }, true)).toContain("\u001B[90m");
  });
});
