import { describe, expect, it } from "vitest";

import { loadRegistry } from "../../../src/core/registry/registry-loader.js";
import { resolveFlow } from "../../../src/core/resolver/flow-resolver.js";

const registry = await loadRegistry("registry");
const defaults = ["feature", "bugfix", "design", "review"];

describe("resolveFlow", () => {
  it("selects bugfix from task text and explains a conditional review omission", () => {
    const result = resolveFlow({ registry, projectType: "monorepo", defaults, task: { text: "Fix broken login", targetPaths: [] } });
    expect(result.id).toBe("bugfix");
    expect(result.steps.map((step) => step.id)).toEqual(["reproduce", "investigate", "fix", "regression-test"]);
    expect(result.omitted).toEqual([{ id: "review", reason: "Review policy is not required." }]);
    expect(result.expertise).toEqual(["testing"]);
  });

  it("includes review when policy requires it", () => {
    const result = resolveFlow({ registry, projectType: "api", defaults, intent: "feature", requiresReview: true });
    expect(result.steps.at(-1)?.id).toBe("review");
    expect(result.expertise).toEqual(["testing", "review"]);
  });

  it("keeps design free of implementation and honors explicit flow selection", () => {
    const result = resolveFlow({ registry, projectType: "web", defaults, intent: "feature", selected: "design" });
    expect(result.id).toBe("design");
    expect(result.steps.map((step) => step.id)).toEqual(["understand", "propose"]);
    expect(result.expertise).toEqual(["architecture"]);
    expect(result.explanation[0]).toContain("explicit");
  });

  it("rejects unknown flows and defaults without a matching intent", () => {
    expect(() => resolveFlow({ registry, projectType: "api", defaults, selected: "missing" })).toThrow('Flow "missing" is not available.');
    expect(() => resolveFlow({ registry, projectType: "api", defaults: ["review"], intent: "bugfix" }))
      .toThrow('No configured flow handles intent "bugfix".');
  });
});
