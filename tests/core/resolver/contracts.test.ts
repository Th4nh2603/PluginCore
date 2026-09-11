import { describe, expect, it } from "vitest";

import { validatePlan, type ResolutionPlan } from "../../../src/core/resolver/contracts.js";

describe("resolution plan validation", () => {
  it("reports an error when a plan contains an unresolved required extension", () => {
    const plan: ResolutionPlan = {
      selected: [],
      operations: [],
      unresolved: [{ id: "auth/example", reason: "not compatible", required: true }],
      explanations: [],
      diagnostics: []
    };

    expect(validatePlan(plan)).toContainEqual(expect.objectContaining({ severity: "error" }));
  });

  it("keeps an unresolved optional extension as a warning", () => {
    const plan: ResolutionPlan = {
      selected: [],
      operations: [],
      unresolved: [{ id: "analytics/example", reason: "not selected", required: false }],
      explanations: [],
      diagnostics: []
    };

    expect(validatePlan(plan)).toContainEqual(expect.objectContaining({ severity: "warning" }));
  });
});
