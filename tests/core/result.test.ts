import { describe, expect, it } from "vitest";

import { RepositoryStandardError } from "../../src/core/errors.js";
import { err, isErr, isOk, ok } from "../../src/core/result.js";

describe("Result", () => {
  it("narrows a success result", () => {
    const result = ok({ id: "web" });

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);

    if (isOk(result)) {
      expect(result.value.id).toBe("web");
    }
  });

  it("narrows a failure result", () => {
    const result = err(new Error("invalid"));

    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it("preserves a stable error code and diagnostic data", () => {
    const error = new RepositoryStandardError("CONFIG_INVALID", "Invalid configuration", {
      diagnosticData: { field: "project.name" }
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.diagnosticData).toEqual({ field: "project.name" });
  });
});
