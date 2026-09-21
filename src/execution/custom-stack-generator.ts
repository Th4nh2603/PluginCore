import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepoConfig } from "../core/config/repo-config.js";
import { selectGenerationStrategy } from "./generation-contract.js";
import type { GeneratorRunner } from "./generator-runner.js";
import { backendFiles } from "./templates/backend.js";
import { frontendFiles } from "./templates/frontend.js";

const componentId = (reference: string | undefined, fallback: string): string => reference?.split("@")[0] ?? fallback;

const writeFiles = async (root: string, files: Record<string, string>): Promise<void> => {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
};

export const generateCustomStack = async (root: string, config: RepoConfig, runner: GeneratorRunner): Promise<void> => {
  if (selectGenerationStrategy(config) !== "custom") throw new Error("The selected stack does not use the Custom generator.");
  const monorepo = config.project.type === "monorepo";
  const hasWeb = monorepo || config.project.type === "web";
  const hasApi = monorepo || config.project.type === "api";
  const frontend = componentId(config.composition.stack.frontend, "react");
  const backend = componentId(config.composition.stack.backend, "express");
  const orm = componentId(config.composition.stack.orm, "prisma");
  const authentication = monorepo ? config.composition.authentication ?? "custom" : undefined;
  const apiRoot = monorepo ? path.join(root, "apps/api") : root;
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (monorepo) {
    await writeFiles(root, {
      "package.json": JSON.stringify({ name: config.project.name, private: true, scripts: { dev: "pnpm --parallel --filter ./apps/web --filter ./apps/api dev", build: "pnpm -r build" } }, null, 2),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
      "packages/shared/package.json": JSON.stringify({ name: `@${config.project.name}/shared`, private: true, type: "module", exports: "./dist/index.js", types: "./dist/index.d.ts", scripts: { build: "tsc" }, devDependencies: { typescript: "^5.9.3" } }, null, 2),
      "packages/shared/tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, declaration: true, rootDir: "src", outDir: "dist", skipLibCheck: true }, include: ["src"] }),
      "packages/shared/src/index.ts": "export interface HealthResponse { status: string; }\n",
      "AGENTS.md": "# Workspace ownership\n\nFrontend: apps/web. Backend: apps/api. Shared contracts: packages/shared.\nRead the matching role file in agents/ before changing a workspace.\n",
      "agents/frontend.toml": `id = "frontend"\nrole = "frontend"\nowns = ["apps/web"]\ninstructions = "Maintain ${frontend} and Vite; run pnpm --filter ./apps/web build."\n`,
      "agents/backend.toml": `id = "backend"\nrole = "backend"\nowns = ["apps/api"]\ninstructions = "Maintain ${backend} and ${orm}; preserve GET /health and authentication routes."\n`,
      "agents/shared.toml": 'id = "shared"\nrole = "shared"\nowns = ["packages/shared"]\ninstructions = "Keep exported contracts compatible."\n',
      "agents/reviewer.toml": 'id = "reviewer"\nrole = "reviewer"\nreview_only = true\ninstructions = "Review changes and validation without modifying source."\n'
    });
  }
  if (hasWeb) await writeFiles(monorepo ? path.join(root, "apps/web") : root, frontendFiles(monorepo ? `@${config.project.name}/web` : config.project.name, frontend, authentication));
  if (hasApi) {
    await writeFiles(apiRoot, backendFiles(monorepo ? `@${config.project.name}/api` : config.project.name, backend, orm, authentication));
    const environment = `DATABASE_URL=postgresql://app:app@localhost:5432/app\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\n${authentication === "custom" ? "JWT_SECRET=" + randomBytes(32).toString("hex") + "\n" : ""}${authentication === "clerk" ? "CLERK_SECRET_KEY=\nCLERK_PUBLISHABLE_KEY=\n" : ""}`;
    await writeFiles(apiRoot, { ".env": environment, ".env.example": environment.replace(/JWT_SECRET=.+/, "JWT_SECRET=replace-with-at-least-32-random-characters") });
    await writeFiles(root, { "docker-compose.yml": "services:\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: app\n    ports:\n      - '127.0.0.1:5432:5432'\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\nvolumes:\n  postgres-data:\n" });
  }
  const apiCommand = monorepo ? "pnpm --filter ./apps/api" : "pnpm";
  await writeFiles(root, {
    ".gitignore": "node_modules/\ndist/\n.env\n.env.local\n",
    "README.md": `# ${config.project.name}\n\n${hasWeb ? `Frontend: ${frontend} + Vite.\n` : ""}${hasApi ? `Backend: ${backend}. ORM: ${orm}. Database: PostgreSQL.\n` : ""}\n## Start\n\nDependencies were installed by the CLI.\n\n${hasApi ? `1. Start PostgreSQL: \`docker compose up -d\`.\n2. Check \`${monorepo ? "apps/api/" : ""}.env\` and set DATABASE_URL if needed.\n3. Create the local schema: \`${apiCommand} db:push\`. This modifies the configured database.\n` : ""}${authentication === "clerk" ? "\nSet CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY in apps/api/.env. Copy apps/web/.env.example to apps/web/.env and set VITE_CLERK_PUBLISHABLE_KEY.\n" : ""}\nRun \`pnpm dev\`. ${hasWeb ? "Web: http://localhost:5173. " : ""}${hasApi ? "Health: http://localhost:3001/health." : ""}\n\nBuild: \`pnpm build\`.\n${authentication === "custom" ? "\nCreate an account from the web form (password: 12–128 characters). Sessions use HttpOnly cookies. The JWT secret is generated per project; use your deployment secret store in production.\n" : ""}${hasApi ? `\nFor versioned migrations, run \`${apiCommand} db:generate\` and \`${apiCommand} db:migrate\`. ${orm === "prisma" ? "Prisma creates migrations through db:migrate; db:generate regenerates its client." : "Drizzle writes SQL migrations through db:generate."}\n` : ""}${authentication === "clerk" ? "\nThe ORM is available for application data; Clerk manages authentication separately.\n" : ""}`
  });
  await runner.run(pnpm, ["install"], root);
  if (hasApi && orm === "prisma") await runner.run(pnpm, [...(monorepo ? ["--filter", "./apps/api"] : []), "exec", "prisma", "generate"], root);
};
