import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, planCreate } from "../../src/application/create-service.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "repo-standard-create-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("planCreate", () => {
  it("resolves a project type from the registry and returns a no-write plan", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", { encoding: "utf8", flag: "w" });
    const targetDirectory = path.join(root, "demo");

    const plan = await planCreate({ name: "demo", projectType: "empty", targetDirectory, registryRoot, stack: {}, agentMode: "automatic", capabilities: [] });

    expect(plan.config.project.type).toBe("empty");
    expect(existsSync(targetDirectory)).toBe(false);
  });

  it("writes only config and managed state after applying a plan", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "empty"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "empty", "manifest.yaml"), "schemaVersion: 1\nid: empty\nkind: project-type\nversion: 1.0.0\ndisplayName: Empty\n", "utf8");
    const targetDirectory = path.join(root, "demo");
    const plan = await planCreate({ name: "demo", projectType: "empty", targetDirectory, registryRoot, stack: {}, agentMode: "automatic", capabilities: [] });

    await applyCreatePlan(plan);

    expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
    expect(existsSync(path.join(targetDirectory, ".repo-standard", "managed-state.yaml"))).toBe(true);
  });

  it("applies an extension-provided recommended preset", async () => {
    const root = await makeRoot();
    const registryRoot = path.join(root, "registry");
    await mkdir(path.join(registryRoot, "project-types", "web", "..", "..", "presets", "recommended-web"), { recursive: true });
    await mkdir(path.join(registryRoot, "project-types", "web"), { recursive: true });
    await writeFile(path.join(registryRoot, "project-types", "web", "manifest.yaml"), "schemaVersion: 1\nid: web\nkind: project-type\nversion: 1.0.0\ndisplayName: Web\n", "utf8");
    await writeFile(path.join(registryRoot, "presets", "recommended-web", "manifest.yaml"), "schemaVersion: 1\nid: recommended-web\nkind: preset\nversion: 1.0.0\ndisplayName: Recommended Web\ncompatibility: { projectTypes: [web] }\nselection: { stack: { framework: nextjs@15, language: typescript@5, packageManager: pnpm@10 } }\n", "utf8");

    const plan = await planCreate({ name: "demo", projectType: "web", targetDirectory: path.join(root, "demo"), registryRoot, preset: "recommended-web", stack: {}, agentMode: "automatic", capabilities: [] });

    expect(plan.config.composition.preset).toBe("recommended-web@1.0.0");
    expect(plan.config.composition.stack).toEqual({ framework: "nextjs@15", language: "typescript@5", packageManager: "pnpm@10" });
  });

  it("runs the Vite React TypeScript generator before writing managed state", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "web-demo");
    const plan = await planCreate({ name: "web-demo", projectType: "web", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-web", stack: {}, agentMode: "automatic", capabilities: [] });
    const commands: string[][] = [];

    await applyCreatePlan(plan, {
      run: async (command, args, cwd) => {
        commands.push([command, ...args, cwd]);
      }
    });

    expect(commands).toEqual([[(process.platform === "win32" ? "pnpm.cmd" : "pnpm"), "create", "vite", ".", "--template", "react-ts", "--no-interactive", targetDirectory]]);
    expect(existsSync(path.join(targetDirectory, "repo.config.yaml"))).toBe(true);
  });

  it("writes a Monorepo workspace with API and shared package sources", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "platform");
    const plan = await planCreate({ name: "platform", projectType: "monorepo", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-monorepo", stack: {}, agentMode: "automatic", capabilities: [] });

    await applyCreatePlan(plan, { run: async () => undefined });

    expect(plan.config.agents).toEqual({ mode: "automatic", enabled: ["frontend@1.0.0", "backend@1.0.0", "shared@1.0.0", "reviewer@1.0.0"], adapters: ["codex"] });
    expect(existsSync(path.join(targetDirectory, "pnpm-workspace.yaml"))).toBe(true);
    expect(await readFile(path.join(targetDirectory, "docker-compose.yml"), "utf8")).toContain("postgres:16");
    expect(await readFile(path.join(targetDirectory, "apps", "api", ".env.example"), "utf8")).toContain("JWT_SECRET");
    expect(await readFile(path.join(targetDirectory, "apps", "api", ".env"), "utf8")).toContain("DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public");
    expect(await readFile(path.join(targetDirectory, "apps", "api", ".gitignore"), "utf8")).toContain(".env");
    expect(await readFile(path.join(targetDirectory, "apps", "api", "prisma", "schema.prisma"), "utf8")).toContain("model User");
    const authRouter = await readFile(path.join(targetDirectory, "apps", "api", "src", "auth", "router.ts"), "utf8");
    expect(authRouter).toContain("/register");
    expect(authRouter).toContain("/login");
    expect(authRouter).toContain("Invalid email or password");
    expect(await readFile(path.join(targetDirectory, "apps", "api", "src", "auth", "password.ts"), "utf8")).toContain("argon2id as 2");
    expect(await readFile(path.join(targetDirectory, "apps", "api", "src", "auth", "token.ts"), "utf8")).toContain("15m");
    const apiPackage = JSON.parse(await readFile(path.join(targetDirectory, "apps", "api", "package.json"), "utf8"));
    expect(apiPackage.dependencies).toMatchObject({ argon2: expect.any(String), jose: expect.any(String), "@prisma/client": expect.any(String) });
    expect(apiPackage.dependencies["@prisma/client"]).toBe("^6.19.3");
    expect(apiPackage.devDependencies.prisma).toBe("^6.19.3");
    const server = await readFile(path.join(targetDirectory, "apps", "api", "src", "server.ts"), "utf8");
    expect(server).toContain("helmet");
    expect(server).toContain("rateLimit");
    expect(server).toContain("/auth");
    const authTests = await readFile(path.join(targetDirectory, "apps", "api", "src", "auth", "router.test.ts"), "utf8");
    expect(authTests).toContain("/auth/register");
    expect(authTests).toContain("/auth/me");
    const webAuthApi = await readFile(path.join(targetDirectory, "apps", "web", "src", "auth", "api.ts"), "utf8");
    expect(webAuthApi).toContain('credentials: "include"');
    expect(webAuthApi).toContain("/auth/login");
    expect(webAuthApi).toContain("/auth/me");
    const loginPage = await readFile(path.join(targetDirectory, "apps", "web", "src", "auth", "LoginPage.tsx"), "utf8");
    expect(loginPage).toContain("Continue with Google");
    expect(loginPage).toContain("type FormEvent");
    expect(await readFile(path.join(targetDirectory, "apps", "web", "src", "auth", "AuthProvider.tsx"), "utf8")).toContain("getCurrentUser");
    expect(await readFile(path.join(targetDirectory, "apps", "web", "src", "auth", "ProtectedApp.tsx"), "utf8")).toContain("Sign out");
    const webStyles = await readFile(path.join(targetDirectory, "apps", "web", "src", "index.css"), "utf8");
    expect(webStyles).toContain("--cobalt: #2256d7");
    expect(webStyles).toContain("prefers-reduced-motion");
    expect(await readFile(path.join(targetDirectory, "AGENTS.md"), "utf8")).toContain("agents/frontend.toml");
    expect(await readFile(path.join(targetDirectory, "agents", "reviewer.toml"), "utf8")).toContain("review_only = true");
    expect(JSON.parse(await readFile(path.join(targetDirectory, "package.json"), "utf8")).packageManager).toBeUndefined();
    expect(await readFile(path.join(targetDirectory, "apps", "api", "src", "server.ts"), "utf8")).toContain("express");
    expect(await readFile(path.join(targetDirectory, "packages", "shared", "src", "index.ts"), "utf8")).toContain("export");
  });

  it("uses custom authentication by default for a Monorepo", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "platform");
    const plan = await planCreate({ name: "platform", projectType: "monorepo", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-monorepo", stack: {}, agentMode: "automatic", capabilities: [] });

    await applyCreatePlan(plan, { run: async () => undefined });

    expect(plan.config.composition.authentication).toBe("custom");
    expect(await readFile(path.join(targetDirectory, "apps", "api", "src", "auth", "password.ts"), "utf8")).toContain("argon2id as 2");
  });

  it("rejects an unsupported authentication provider before creating a plan", async () => {
    const root = await makeRoot();

    await expect(planCreate({ name: "platform", projectType: "monorepo", targetDirectory: path.join(root, "platform"), registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-monorepo", stack: {}, agentMode: "automatic", capabilities: [], authentication: "firebase" as never }))
      .rejects.toThrow("Authentication must be either custom or clerk.");
  });

  it("generates a Clerk authentication scaffold when selected", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "platform");
    const plan = await planCreate({ name: "platform", projectType: "monorepo", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-monorepo", stack: {}, agentMode: "automatic", capabilities: [], authentication: "clerk" });
    const commands: string[][] = [];

    await applyCreatePlan(plan, { run: async (command, args, cwd) => { commands.push([command, ...args, cwd]); } });

    expect(plan.config.composition.authentication).toBe("clerk");
    expect(await readFile(path.join(targetDirectory, "apps", "web", ".env.example"), "utf8")).toContain("VITE_CLERK_PUBLISHABLE_KEY");
    expect(await readFile(path.join(targetDirectory, "apps", "api", ".env.example"), "utf8")).toContain("CLERK_SECRET_KEY");
    expect(existsSync(path.join(targetDirectory, "apps", "api", "src", "auth", "router.ts"))).toBe(false);
    expect(existsSync(path.join(targetDirectory, "apps", "api", "src", "auth", "password.ts"))).toBe(false);
    const webPackage = JSON.parse(await readFile(path.join(targetDirectory, "apps", "web", "package.json"), "utf8"));
    expect(webPackage.dependencies["@clerk/react"]).toBe("^6.16.1");
    const apiPackage = JSON.parse(await readFile(path.join(targetDirectory, "apps", "api", "package.json"), "utf8"));
    expect(apiPackage.dependencies["@clerk/express"]).toBe("^2.1.69");
    expect(commands.map((command) => command.slice(1, -1))).not.toContainEqual(["--filter", "./apps/api", "exec", "prisma", "generate"]);
    const clerkApp = await readFile(path.join(targetDirectory, "apps", "web", "src", "App.tsx"), "utf8");
    expect(clerkApp).toContain("useAuth");
    expect(clerkApp).toContain("getToken()");
    expect(clerkApp).toContain("Authorization: `Bearer ${token}`");
    expect(clerkApp).toContain("/auth/me");
    const clerkServer = await readFile(path.join(targetDirectory, "apps", "api", "src", "server.ts"), "utf8");
    expect(clerkServer).toContain("isAuthenticated");
  });

  it("generates the Web workspace and installs Monorepo dependencies", async () => {
    const root = await makeRoot();
    const targetDirectory = path.join(root, "platform");
    const plan = await planCreate({ name: "platform", projectType: "monorepo", targetDirectory, registryRoot: path.join(process.cwd(), "registry"), preset: "recommended-monorepo", stack: {}, agentMode: "automatic", capabilities: [] });
    const commands: string[][] = [];
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await applyCreatePlan(plan, { run: async (command, args, cwd) => { commands.push([command, ...args, cwd]); } });

    expect(commands).toEqual([
      [pnpm, "create", "vite", "apps/web", "--template", "react-ts", "--no-interactive", targetDirectory],
      [pnpm, "install", targetDirectory],
      [pnpm, "--filter", "./apps/api", "exec", "prisma", "generate", targetDirectory]
    ]);
  });
});
