import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { defaultGeneratorRunner, type GeneratorRunner } from "./generator-runner.js";
import { generateCustomStack } from "./custom-stack-generator.js";
import { selectGenerationStrategy } from "./generation-contract.js";
import { selectAuthenticationExecutor } from "./capabilities/authentication.js";
import type { GenerationResult } from "../core/planning/execution-plan.js";
import { listGeneratedFiles } from "./generated-files.js";
import { hasMcpCapability } from "./capabilities/mcp-selection.js";

const writeMonorepoScaffold = async (targetDirectory: string, name: string): Promise<void> => {
  const packageScope = `@${name}`;
  const files: Readonly<Record<string, string>> = {
    "package.json": `${JSON.stringify({
      name,
      private: true,
      scripts: {
        dev: "pnpm --parallel --filter ./apps/web --filter ./apps/api dev",
        "dev:web": "pnpm --filter ./apps/web dev",
        "dev:api": "pnpm --filter ./apps/api dev",
        build: "pnpm -r build",
        test: "pnpm -r test"
      }
    }, null, 2)}\n`,
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true } }, null, 2)}\n`,
    "docker-compose.yml": "services:\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: app\n    ports:\n      - \"5432:5432\"\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\n\nvolumes:\n  postgres-data:\n",
    "AGENTS.md": "# Monorepo agent coordination\n\nRead the TOML role instruction before working in its owned workspace. Split independent work by ownership and ask the reviewer role to inspect completed changes.\n\n- Frontend: `agents/frontend.toml` owns `apps/web`.\n- Backend: `agents/backend.toml` owns `apps/api`.\n- Shared: `agents/shared.toml` owns `packages/shared`.\n- Reviewer: `agents/reviewer.toml` is review-only.\n",
    "agents/frontend.toml": "id = \"frontend\"\nrole = \"frontend\"\nowns = [\"apps/web\"]\ncommands = [\"pnpm --filter ./apps/web build\"]\nreview_only = false\ninstructions = \"Own React and Vite behavior. Keep changes scoped to the web app unless coordinating an interface change.\"\n",
    "agents/backend.toml": "id = \"backend\"\nrole = \"backend\"\nowns = [\"apps/api\"]\ncommands = [\"pnpm --filter ./apps/api build\"]\nreview_only = false\ninstructions = \"Own Express routes, validation, and API contracts. Keep secrets out of source and preserve GET /health.\"\n",
    "agents/shared.toml": "id = \"shared\"\nrole = \"shared\"\nowns = [\"packages/shared\"]\ncommands = [\"pnpm --filter ./packages/shared build\"]\nreview_only = false\ninstructions = \"Own public TypeScript exports. Make backward-compatible changes by default and coordinate contract changes.\"\n",
    "agents/reviewer.toml": "id = \"reviewer\"\nrole = \"reviewer\"\nowns = []\ncommands = [\"pnpm test\", \"pnpm lint\"]\nreview_only = true\ninstructions = \"Do not implement source changes. Inspect cross-workspace contracts, tests, security, and build impact; report findings with paths and severity.\"\n",
    "apps/api/.gitignore": ".env\n",
    "apps/api/prisma/schema.prisma": "generator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\nmodel User {\n  id           String   @id @default(cuid())\n  email        String   @unique\n  passwordHash String?\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n}\n",
    "apps/api/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src"] }, null, 2)}\n`,
    "packages/shared/package.json": `${JSON.stringify({
      name: `${packageScope}/shared`, private: true, type: "module",
      exports: "./dist/index.js", types: "./dist/index.d.ts",
      scripts: { build: "tsc -p tsconfig.json", test: "vitest run" },
      devDependencies: { typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "packages/shared/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist", declaration: true }, include: ["src"] }, null, 2)}\n`,
    "packages/shared/src/index.ts": "export const serviceName = \"shared\";\n",
    "apps/web/src/index.css": ":root { --ink: #10233f; --cobalt: #2256d7; --signal: #54e0b5; --mist: #f4f7fb; --line: #c8d4e3; --alert: #b42318; color: var(--ink); background: var(--mist); font-family: \"IBM Plex Sans\", system-ui, sans-serif; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-width: 320px; }\nbutton, input { font: inherit; }\nbutton:focus-visible, input:focus-visible { outline: 3px solid var(--signal); outline-offset: 2px; }\n.access-layout { min-height: 100vh; display: grid; grid-template-columns: minmax(18rem, 0.8fr) minmax(24rem, 1fr); background: white; }\n.status-rail { padding: clamp(2rem, 7vw, 7rem); color: white; background: var(--ink); display: flex; flex-direction: column; justify-content: space-between; }\n.status-rail h1, .login-panel h2, .protected-app h1 { letter-spacing: -0.05em; line-height: 0.96; font-size: clamp(2.4rem, 5vw, 5rem); margin: 0; }\n.eyebrow { color: var(--cobalt); font-family: \"IBM Plex Mono\", ui-monospace, monospace; font-size: 0.73rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }\n.status-rail .eyebrow { color: var(--signal); }\n.status-rail dl { margin: 3rem 0 0; display: grid; gap: 1rem; font-family: \"IBM Plex Mono\", ui-monospace, monospace; font-size: 0.8rem; }\n.status-rail dl div { border-top: 1px solid rgba(255,255,255,0.28); padding-top: 0.65rem; display: flex; justify-content: space-between; }\n.status-rail dd { margin: 0; color: var(--signal); }\n.login-panel { padding: clamp(2rem, 8vw, 8rem); max-width: 38rem; width: 100%; margin: auto; }\n.login-copy > p:last-child { color: #53657b; margin-bottom: 2rem; }\nform { display: grid; gap: 1rem; }\nlabel { display: grid; gap: 0.45rem; font-weight: 650; }\ninput { border: 1px solid var(--line); border-radius: 0.25rem; padding: 0.8rem 0.9rem; background: white; }\nbutton { min-height: 2.8rem; border: 0; border-radius: 0.25rem; padding: 0.7rem 1rem; background: var(--cobalt); color: white; cursor: pointer; font-weight: 750; }\nbutton:disabled { cursor: wait; opacity: 0.65; }\n.google-button { width: 100%; background: white; color: var(--ink); border: 1px solid var(--line); }\n.divider { color: #6e7f94; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.8rem; margin: 1.25rem 0; font-size: 0.8rem; }\n.divider::before, .divider::after { content: \"\"; height: 1px; background: var(--line); }\n.form-error { color: var(--alert); margin: 0; font-size: 0.9rem; }\n.loading, .protected-app { min-height: 100vh; padding: clamp(2rem, 10vw, 9rem); display: grid; align-content: center; gap: 1rem; }\n.protected-app { background: var(--mist); }\n.protected-app button { width: fit-content; }\n@media (max-width: 720px) { .access-layout { grid-template-columns: 1fr; } .status-rail { padding: 2rem; min-height: auto; gap: 2rem; } .status-rail h1 { font-size: 2.6rem; } .login-panel { padding: 2.5rem 2rem 4rem; } }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }\n",
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};

export const generateCreateScaffold = async (targetDirectory: string, config: RepoConfig, runner: GeneratorRunner = defaultGeneratorRunner, deferAuthentication = false): Promise<GenerationResult> => {
  const strategy = selectGenerationStrategy(config);
  const authentication = deferAuthentication ? undefined : selectAuthenticationExecutor(config);
  if (strategy === "custom") {
    await generateCustomStack(targetDirectory, config, runner, authentication, !deferAuthentication);
  } else if (strategy === "monorepo") {
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await runner.run(pnpm, ["create", "vite", "apps/web", "--template", "react-ts", "--no-interactive"], targetDirectory);
    await writeMonorepoScaffold(targetDirectory, config.project.name);
    if (!deferAuthentication) {
      if (authentication === undefined) throw new RepositoryStandardError("CONFIG_INVALID", "Monorepo requires an authentication capability.");
      await authentication.generateLegacy(targetDirectory, config.project.name, hasMcpCapability(config));
      await runner.run(pnpm, ["install"], targetDirectory);
      await runner.run(pnpm, ["--filter", "./apps/api", "exec", "prisma", "generate"], targetDirectory);
    }
  } else if (strategy === "web") {
    await runner.run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["create", "vite", ".", "--template", "react-ts", "--no-interactive"], targetDirectory);
  }
  return { files: await listGeneratedFiles(targetDirectory) };
};
