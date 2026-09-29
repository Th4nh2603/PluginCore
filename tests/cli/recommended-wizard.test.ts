import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runCli } from "../../src/cli/main.js";
import type { SelectOption } from "../../src/cli/presentation.js";

describe("recommended create wizard", () => {
  it("requires a hidden-password prompt for interactive Custom Authentication", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-initial-no-secret-"));
    const target = path.join(root, "platform");
    try {
      await expect(runCli(["create", "platform", "--type", "monorepo", "--target", target], {
        write: () => undefined,
        prompt: {
          input: async () => "alice", confirm: async () => false,
          select: async (message) => ({ "Agent setup": "none", "Start from": "recommended", "Configure stack": "continue", Review: "install" })[message] ?? "invalid"
        },
        generatorRunner: { run: async () => undefined }
      })).rejects.toThrow("hidden password");
      expect(existsSync(target)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("creates the fixed admin account after Install and writes an ignored hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-initial-wizard-"));
    const target = path.join(root, "platform");
    const prompts: string[] = [];
    const output: string[] = [];
    try {
      expect(await runCli(["create", "platform", "--type", "monorepo", "--target", target], {
        write: (line) => output.push(line),
        prompt: {
          input: async () => { throw new Error("Admin username must not be prompted"); },
          secret: async (message) => { prompts.push(message); return "long-enough-password"; },
          confirm: async () => false,
          select: async (message) => ({ "Agent setup": "none", "Start from": "recommended", "Configure stack": "continue", Review: "install" })[message] ?? "invalid"
        },
        generatorRunner: { run: async () => undefined }
      })).toBe(0);
      expect(prompts).toEqual(["Password", "Confirm password"]);
      expect(output.join("\n")).toContain("Admin username: admin");
      const bootstrap = await readFile(path.join(target, ".repo-standard", "initial-user.json"), "utf8");
      expect(bootstrap).toContain('"username":"admin"');
      expect(bootstrap).not.toContain("long-enough-password");
      expect(await readFile(path.join(target, ".gitignore"), "utf8")).toContain(".repo-standard/initial-user.json");
      expect(await readFile(path.join(target, "repo.config.yaml"), "utf8")).not.toContain('"admin"');
      expect(await readFile(path.join(target, ".repo-standard", "managed-state.yaml"), "utf8")).not.toContain("initial-user.json");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("retries short and mismatched passwords before creating the project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-initial-mismatch-"));
    const target = path.join(root, "platform");
    let secretCount = 0;
    const output: string[] = [];
    try {
      expect(await runCli(["create", "platform", "--type", "monorepo", "--target", target], {
        write: (line) => output.push(line),
        prompt: {
          input: async () => { throw new Error("Admin username must not be prompted"); },
          secret: async () => {
            expect(existsSync(target)).toBe(false);
            return ["short", "short", "long-enough-password", "different-password", "long-enough-password", "long-enough-password"][secretCount++]!;
          },
          confirm: async () => false,
          select: async (message) => ({ "Agent setup": "none", "Start from": "recommended", "Configure stack": "continue", Review: "install" })[message] ?? "invalid"
        },
        generatorRunner: { run: async () => undefined }
      })).toBe(0);
      expect(secretCount).toBe(6);
      expect(output.join("\n")).toContain("Admin username: admin");
      expect(output.join("\n")).toContain("12–128");
      expect(output.join("\n")).toContain("confirmation");
      expect(JSON.parse(await readFile(path.join(target, ".repo-standard", "initial-user.json"), "utf8")).username).toBe("admin");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("edits a preset in place and installs only after Review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-unified-"));
    const targetDirectory = path.join(root, "platform");
    const messages: string[] = [];
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: (line) => output.push(line),
        prompt: {
          input: async () => "unused",
          secret: async () => "long-enough-password",
          confirm: async () => false,
          select: async (message) => {
            messages.push(message);
            if (message === "Agent setup") return "automatic";
            if (message === "Start from") return "recommended";
            if (message === "Configure stack") return messages.filter((item) => item === "Configure stack").length === 1 ? "edit:frontend" : "continue";
            if (message === "Frontend") return "vue";
            if (message === "Review") {
              expect(existsSync(targetDirectory)).toBe(false);
              expect(output.join("\n")).toContain("Frontend: Vue");
              return "install";
            }
            throw new Error(`Unexpected prompt: ${message}`);
          }
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect(messages).toEqual(["Agent setup", "Start from", "Configure stack", "Frontend", "Configure stack", "Review"]);
      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
      expect(config.composition.stack["frontend-library"]).toBe("vue@3.0.0");
      const webPackage = JSON.parse(await readFile(path.join(targetDirectory, "apps/web/package.json"), "utf8"));
      expect(webPackage.dependencies.vue).toBeTruthy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("returns from Review to edit Authentication while preserving the preset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-edit-review-"));
    const targetDirectory = path.join(root, "platform");
    let reviewCount = 0;
    let configureCount = 0;
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused",
          confirm: async () => false,
          select: async (message) => {
            if (message === "Agent setup") return "automatic";
            if (message === "Start from") return "recommended";
            if (message === "Configure stack") return ["continue", "edit:auth", "continue"][configureCount++] ?? "invalid";
            if (message === "Authentication") return "clerk";
            if (message === "Review") return reviewCount++ === 0 ? "edit" : "install";
            throw new Error(`Unexpected prompt: ${message}`);
          }
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
      expect(config.composition.authentication).toBe("clerk");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("keeps --auth authoritative in the editor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-locked-auth-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--auth", "clerk", "--target", targetDirectory], {
        write: (line) => output.push(line),
        prompt: {
          input: async () => "unused", confirm: async () => false,
          select: async (message) => {
            if (message === "Agent setup") return "automatic";
            if (message === "Start from") return "recommended";
            if (message === "Configure stack") return "continue";
            if (message === "Review") return "install";
            throw new Error(`Authentication should remain fixed: ${message}`);
          }
        },
        generatorRunner: { run: async () => undefined }
      });
      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("Authentication: Clerk Authentication");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("cancels from Review without writing files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-cancel-"));
    const targetDirectory = path.join(root, "platform");
    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: () => undefined,
        prompt: {
          input: async () => "unused", confirm: async () => false,
          select: async (message) => ({ "Agent setup": "automatic", "Start from": "recommended", "Configure stack": "continue", Review: "cancel" })[message] ?? "invalid"
        },
        generatorRunner: { run: async () => { throw new Error("Generator must not run"); } }
      });
      expect(exitCode).toBe(2);
      expect(existsSync(targetDirectory)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("shows the recommended stack before the user approves installation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    const selectMessages: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          secret: async () => "long-enough-password",
          select: async (message: string, choices: readonly SelectOption[]) => {
            selectMessages.push(message);
            if (message === "Agent setup") return "automatic";

            if (message === "Project type") {
              expect(choices.find((choice) => choice.value === "monorepo")?.name).toBe("Monorepo");
              return "monorepo";
            }

            if (message === "Start from") {
              expect(choices.map((choice) => choice.name)).toEqual(["Recommended Monorepo", "Custom"]);
              return "recommended";
            }
            if (message === "Configure stack") return "continue";
            if (message === "Review") {
              expect(choices.map((choice) => choice.name)).toEqual(["Install", "Edit stack", "Cancel"]);
              return "install";
            }

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => {
            throw new Error("The recommended wizard must use the Continue selection instead of a yes/no confirmation.");
          }
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);
      expect(selectMessages).toEqual(["Project type", "Agent setup", "Start from", "Configure stack", "Review"]);
      expect(output.join("\n")).toContain("Recommended Monorepo");
      expect(output.join("\n")).toContain("Frontend: React");
      expect(output.join("\n")).toContain("Authentication: Custom Authentication");
      expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo@1.0.0");
      expect(config.composition.authentication).toBe("custom");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates the Clerk Monorepo preset selected from the list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-clerk-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--preset", "recommended-monorepo-clerk", "--target", targetDirectory], {
        write: (line) => output.push(line),
        prompt: {
          input: async () => "unused",
          secret: async () => { throw new Error("Clerk must not ask for a password"); },
          select: async (message) => {
            if (message === "Agent setup") return "automatic";
            if (message === "Configure stack") return "continue";
            if (message === "Review") return "install";
            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      });

      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("Authentication: Clerk Authentication");
      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBe("recommended-monorepo-clerk@1.0.0");
      expect(config.composition.authentication).toBe("clerk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects authentication during Custom Monorepo setup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-customize-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];
    let configureCount = 0;
    try {
      const exitCode = await runCli(["create", "platform", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string, choices: readonly { readonly name: string; readonly value: string }[]) => {
            if (message === "Agent setup") return "automatic";
            if (message === "Project type") return "monorepo";
            if (message === "Start from") return "custom";
            if (message === "Configure stack") {
              return ["edit:frontend", "edit:backend", "edit:orm", "edit:auth", "continue"][configureCount++] ?? "invalid";
            }
            if (message === "Frontend") return "react";
            if (message === "Backend") return "express";
            if (message === "ORM") return "prisma";
            if (message === "Review") return "install";

            if (message === "Authentication") {
              expect(choices.map((choice) => choice.name)).toEqual([
                "Custom Authentication",
                "Clerk Authentication"
              ]);
              return "clerk";
            }

            throw new Error(`Unexpected select prompt: ${message}`);
          },
          confirm: async () => false
        },
        generatorRunner: { run: async () => undefined }
      } as never);

      expect(exitCode).toBe(0);

      const config = parse(await readFile(path.join(targetDirectory, "repo.config.yaml"), "utf8"));
      expect(config.composition.preset).toBeUndefined();
      expect(config.composition.authentication).toBe("clerk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not install a recommended stack after an invalid approval selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-wizard-invalid-"));
    const targetDirectory = path.join(root, "platform");
    const output: string[] = [];

    try {
      const exitCode = await runCli(["create", "platform", "--type", "monorepo", "--target", targetDirectory], {
        write: (line: string) => output.push(line),
        prompt: {
          input: async () => "unused",
          select: async (message: string) => ({ "Agent setup": "automatic", "Start from": "recommended", "Configure stack": "continue", Review: "invalid" }[message] ?? ""),
          confirm: async () => false
        },
        generatorRunner: { run: async () => { throw new Error("Generator must not run without approval."); } }
      } as never);

      expect(exitCode).toBe(2);
      expect(output.join("\n")).toContain("Creation cancelled. No files were written.");
      expect(existsSync(targetDirectory)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
