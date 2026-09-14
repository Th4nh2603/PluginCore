import { describe, expect, it } from "vitest";

import { formatPresetPreview } from "../../src/cli/presentation.js";

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
