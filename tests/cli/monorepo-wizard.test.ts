import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runMonorepoEditor } from "../../src/cli/monorepo-wizard.js";
import type { CliPrompt } from "../../src/cli/main.js";
import { Registry, loadRegistry } from "../../src/core/registry/registry-loader.js";
import { ExtensionKinds } from "../../src/core/registry/manifest.js";

const registryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../registry");
const loadTestRegistry = () => loadRegistry(registryRoot);

const scriptedPrompt = (answers: readonly string[], messages: string[]): CliPrompt => {
  let index = 0;
  return {
    input: async () => "unused",
    confirm: async () => false,
    select: async (message) => {
      messages.push(message);
      const answer = answers[index++];
      if (answer === undefined) throw new Error(`Unexpected prompt: ${message}`);
      return answer;
    }
  };
};

describe("Monorepo editor", () => {
  it("keeps the preset while changing only the chosen component", async () => {
    const messages: string[] = [];
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "recommended", "edit:frontend", "vue", "continue"
    ], messages), {});

    expect(result).toMatchObject({
      preset: "recommended-monorepo",
      stack: { "frontend-library": "vue@3.0.0" },
      authentication: "custom",
      changed: true
    });
    expect(messages).toEqual(["Start from", "Configure stack", "Frontend", "Configure stack"]);
  });

  it("requires every editable value when starting from Custom", async () => {
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "custom", "edit:frontend", "react", "edit:backend", "fastify",
      "edit:orm", "drizzle", "edit:auth", "clerk", "continue"
    ], []), {});

    expect(result).toMatchObject({
      stack: {
        "frontend-library": "react@19.0.0",
        "backend-framework": "fastify@5.0.0",
        orm: "drizzle@0.45.0"
      },
      authentication: "clerk",
      changed: false
    });
    expect(result?.preset).toBeUndefined();
  });

  it("honors explicit authentication without prompting for a replacement", async () => {
    const messages: string[] = [];
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "recommended", "continue"
    ], messages), { authentication: "clerk" });

    expect(result?.authentication).toBe("clerk");
    expect(messages).toEqual(["Start from", "Configure stack"]);
  });

  it("prompts for the first missing field after Continue from Custom", async () => {
    const messages: string[] = [];
    let menuCount = 0;
    const result = await runMonorepoEditor(await loadTestRegistry(), {
      input: async () => "unused", confirm: async () => false,
      select: async (message) => {
        messages.push(message);
        if (message === "Start from") return "custom";
        if (message === "Configure stack") return ["continue", "edit:backend", "edit:orm", "edit:auth", "continue"][menuCount++] ?? "invalid";
        return ({ Frontend: "react", Backend: "express", ORM: "prisma", Authentication: "custom" })[message] ?? "invalid";
      }
    }, {});

    expect(result?.stack["frontend-library"]).toBe("react@19.0.0");
    expect(messages.slice(0, 3)).toEqual(["Start from", "Configure stack", "Frontend"]);
  });

  it("does not offer an editable Authentication row when --auth is set", async () => {
    const choices: string[] = [];
    const labels: string[] = [];
    const result = await runMonorepoEditor(await loadTestRegistry(), {
      input: async () => "unused", confirm: async () => false,
      select: async (message, options) => {
        if (message === "Start from") return "recommended";
        if (message === "Configure stack") {
          choices.push(...options.map((option) => option.value));
          labels.push(...options.map((option) => option.name));
          return "continue";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }
    }, { authentication: "clerk" });
    expect(result?.authentication).toBe("clerk");
    expect(choices).not.toContain("edit:auth");
    expect(labels.some((label) => label.includes("Authentication: Clerk Authentication (fixed)"))).toBe(true);
  });

  it("accepts registry entries without compatibility restrictions", async () => {
    const registry = await loadTestRegistry();
    const unrestricted = new Registry(ExtensionKinds.flatMap((kind) => registry.list(kind).map((item) => {
      const entry = { ...item };
      delete entry.compatibility;
      return entry;
    })));
    const result = await runMonorepoEditor(unrestricted, scriptedPrompt(["recommended", "continue"], []), {});
    expect(result?.preset).toBe("recommended-monorepo");
  });

  it("requires replacing a preset component missing from the registry", async () => {
    const registry = await loadTestRegistry();
    const withoutReact = new Registry(ExtensionKinds.flatMap((kind) => registry.list(kind).filter((item) => item.id !== "react")));
    const messages: string[] = [];
    const result = await runMonorepoEditor(withoutReact, scriptedPrompt(["recommended", "continue"], messages), {});
    expect(result?.stack["frontend-library"]).toBe("vue@3.0.0");
    expect(messages).toEqual(["Start from", "Configure stack"]);
  });

  it("does not mark the preset edited when the same component is selected again", async () => {
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "recommended", "edit:frontend", "react", "continue"
    ], []), {});
    expect(result?.stack).toEqual({});
    expect(result?.changed).toBe(false);
  });

  it("clears the edited state after changing a component back to its preset value", async () => {
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "recommended", "edit:frontend", "vue", "edit:frontend", "react", "continue"
    ], []), {});
    expect(result?.stack).toEqual({});
    expect(result?.changed).toBe(false);
  });

  it("offers Custom when no compatible preset exists", async () => {
    const registry = await loadTestRegistry();
    const withoutPresets = new Registry(ExtensionKinds.flatMap((kind) =>
      kind === "preset" ? [] : registry.list(kind)
    ));
    const messages: string[] = [];
    const result = await runMonorepoEditor(withoutPresets, scriptedPrompt([
      "custom", "edit:frontend", "react", "edit:backend", "express",
      "edit:orm", "prisma", "edit:auth", "custom", "continue"
    ], messages), {});

    expect(result?.preset).toBeUndefined();
    expect(messages[0]).toBe("Start from");
  });

  it("fills a category with one value without asking a redundant submenu", async () => {
    const registry = await loadTestRegistry();
    const oneFrontend = new Registry(ExtensionKinds.flatMap((kind) =>
      registry.list(kind).filter((item) => item.kind !== "stack-component" || item.category !== "frontend" || item.id === "vue")
    ));
    const messages: string[] = [];
    const result = await runMonorepoEditor(oneFrontend, scriptedPrompt([
      "custom", "edit:backend", "express", "edit:orm", "prisma", "edit:auth", "custom", "continue"
    ], messages), {});

    expect(result?.stack["frontend-library"]).toBe("vue@3.0.0");
    expect(messages).not.toContain("Frontend");
  });

  it("cannot continue when the registry has no ORM options", async () => {
    const registry = await loadTestRegistry();
    const withoutOrm = new Registry(ExtensionKinds.flatMap((kind) =>
      registry.list(kind).filter((item) => item.kind !== "stack-component" || item.category !== "orm")
    ));
    const result = await runMonorepoEditor(withoutOrm, scriptedPrompt(["custom"], []), {});
    expect(result).toBeUndefined();
  });

  it("rejects an unavailable editor action without creating a selection", async () => {
    const result = await runMonorepoEditor(await loadTestRegistry(), scriptedPrompt([
      "recommended", "not-an-action"
    ], []), {});
    expect(result).toBeUndefined();
  });
});
