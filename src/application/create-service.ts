import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RepoConfig } from "../core/config/repo-config.js";
import { RepositoryStandardError } from "../core/errors.js";
import { loadRegistry } from "../core/registry/registry-loader.js";
import { createManagedState, writeYamlAtomically } from "./project-state.js";
import { defaultGeneratorRunner, type GeneratorRunner } from "./generator-runner.js";
import { stringify } from "yaml";

export interface CreateInput {
  readonly name: string;
  readonly targetDirectory: string;
  readonly registryRoot: string;
  readonly projectType: string;
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly capabilities: readonly { readonly id: string; readonly version: string; readonly configRef?: string }[];
  readonly agentMode: RepoConfig["agents"]["mode"];
}

export interface CreatePlan {
  readonly targetDirectory: string;
  readonly config: RepoConfig;
  readonly operations: readonly ("write-config" | "write-managed-state")[];
  readonly preview: string;
}

const validName = /^[a-z0-9][a-z0-9-]*$/i;
const monorepoAgentIds = ["frontend@1.0.0", "backend@1.0.0", "shared@1.0.0", "reviewer@1.0.0"];

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
    "apps/api/package.json": `${JSON.stringify({
      name: `${packageScope}/api`, private: true, type: "module",
      scripts: { dev: "tsx watch src/server.ts", build: "tsc -p tsconfig.json", start: "node dist/server.js", test: "vitest run" },
      dependencies: { [`${packageScope}/shared`]: "workspace:*", "@prisma/client": "^6.19.3", argon2: "^0.45.1", "cookie-parser": "^1.4.7", cors: "^2.8.5", dotenv: "^17.4.2", express: "^5.1.0", "express-rate-limit": "^8.7.0", helmet: "^8.3.0", jose: "^6.2.12", zod: "^4.6.5" },
      devDependencies: { "@types/cookie-parser": "^1.4.10", "@types/cors": "^2.8.19", "@types/express": "^5.0.1", "@types/node": "^22.18.12", prisma: "^6.19.3", tsx: "^4.20.5", typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "apps/api/.env.example": "DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public\nJWT_SECRET=replace-with-a-long-random-secret\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\nNODE_ENV=development\n",
    "apps/api/.env": "DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public\nJWT_SECRET=development-only-secret-change-before-production\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\nNODE_ENV=development\n",
    "apps/api/.gitignore": ".env\n",
    "apps/api/prisma/schema.prisma": "generator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\nmodel User {\n  id           String   @id @default(cuid())\n  email        String   @unique\n  passwordHash String?\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n}\n",
    "apps/api/src/auth/config.ts": "import { z } from \"zod\";\n\nconst environment = z.object({\n  DATABASE_URL: z.string().url(),\n  JWT_SECRET: z.string().min(32),\n  WEB_ORIGIN: z.string().url(),\n  PORT: z.coerce.number().int().positive().default(3001),\n  NODE_ENV: z.enum([\"development\", \"test\", \"production\"]).default(\"development\")\n});\n\nexport const authConfig = environment.parse(process.env);\n",
    "apps/api/src/auth/password.ts": "import argon2 from \"argon2\";\n\nconst options = { type: argon2.argon2id as 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };\n\nexport const hashPassword = (password: string): Promise<string> => argon2.hash(password, options);\nexport const verifyPassword = (hash: string, password: string): Promise<boolean> => argon2.verify(hash, password);\n",
    "apps/api/src/auth/token.ts": "import { jwtVerify, SignJWT } from \"jose\";\n\nimport { authConfig } from \"./config.js\";\n\nexport interface AuthUser { id: string; email: string; }\n\nconst secret = new TextEncoder().encode(authConfig.JWT_SECRET);\nexport const issueAccessToken = (user: AuthUser): Promise<string> => new SignJWT({ email: user.email }).setProtectedHeader({ alg: \"HS256\" }).setSubject(user.id).setIssuedAt().setExpirationTime(\"15m\").sign(secret);\nexport const verifyAccessToken = async (token: string): Promise<AuthUser> => {\n  const { payload } = await jwtVerify(token, secret);\n  if (typeof payload.sub !== \"string\" || typeof payload.email !== \"string\") throw new Error(\"Invalid token payload.\");\n  return { id: payload.sub, email: payload.email };\n};\n",
    "apps/api/src/auth/prisma.ts": "import { PrismaClient } from \"@prisma/client\";\n\nexport const prisma = new PrismaClient();\n",
    "apps/api/src/auth/middleware.ts": "import type { RequestHandler } from \"express\";\n\nimport { verifyAccessToken } from \"./token.js\";\n\nexport const requireAuth: RequestHandler = async (request, response, next) => {\n  const token = request.cookies.access_token;\n  if (typeof token !== \"string\") { response.status(401).json({ error: \"Unauthorized\" }); return; }\n  try { response.locals.authUser = await verifyAccessToken(token); next(); }\n  catch { response.status(401).json({ error: \"Unauthorized\" }); }\n};\n",
    "apps/api/src/auth/router.ts": "import { Router } from \"express\";\nimport { z } from \"zod\";\n\nimport { authConfig } from \"./config.js\";\nimport { requireAuth } from \"./middleware.js\";\nimport { hashPassword, verifyPassword } from \"./password.js\";\nimport { prisma } from \"./prisma.js\";\nimport { issueAccessToken } from \"./token.js\";\n\nconst credentials = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()), password: z.string().min(12).max(128) });\nconst cookieOptions = { httpOnly: true, sameSite: \"lax\" as const, secure: authConfig.NODE_ENV === \"production\", path: \"/\", maxAge: 15 * 60 * 1000 };\nconst publicUser = (user: { id: string; email: string }) => ({ id: user.id, email: user.email });\nexport const authRouter = Router();\n\nauthRouter.post(\"/register\", async (request, response, next) => {\n  try {\n    const input = credentials.parse(request.body);\n    const existing = await prisma.user.findUnique({ where: { email: input.email } });\n    if (existing) { response.status(409).json({ error: \"Unable to create account\" }); return; }\n    const user = await prisma.user.create({ data: { email: input.email, passwordHash: await hashPassword(input.password) } });\n    response.status(201).json({ user: publicUser(user) });\n  } catch (error) { next(error); }\n});\n\nauthRouter.post(\"/login\", async (request, response, next) => {\n  try {\n    const input = credentials.parse(request.body);\n    const user = await prisma.user.findUnique({ where: { email: input.email } });\n    if (!user?.passwordHash || !await verifyPassword(user.passwordHash, input.password)) { response.status(401).json({ error: \"Invalid email or password\" }); return; }\n    response.cookie(\"access_token\", await issueAccessToken(user), cookieOptions).json({ user: publicUser(user) });\n  } catch (error) { next(error); }\n});\n\nauthRouter.post(\"/logout\", (_request, response) => response.clearCookie(\"access_token\", cookieOptions).status(204).end());\nauthRouter.get(\"/me\", requireAuth, (request, response) => response.json({ user: response.locals.authUser }));\n",
    "apps/api/src/auth/router.test.ts": "import { describe, expect, it } from \"vitest\";\n\nconst routes = [\"POST /auth/register\", \"POST /auth/login\", \"POST /auth/logout\", \"GET /auth/me\"];\n\ndescribe(\"auth route contract\", () => {\n  it(\"includes registration and current-user endpoints\", () => {\n    expect(routes).toContain(\"POST /auth/register\");\n    expect(routes).toContain(\"GET /auth/me\");\n  });\n});\n",
    "apps/api/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src"] }, null, 2)}\n`,
    "apps/api/src/server.ts": "import \"dotenv/config\";\n\nimport cookieParser from \"cookie-parser\";\nimport cors from \"cors\";\nimport express from \"express\";\nimport rateLimit from \"express-rate-limit\";\nimport helmet from \"helmet\";\n\nimport { authConfig } from \"./auth/config.js\";\nimport { authRouter } from \"./auth/router.js\";\n\nconst app = express();\nconst authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: \"draft-8\", legacyHeaders: false });\napp.use(helmet());\napp.use(cors({ origin: authConfig.WEB_ORIGIN, credentials: true }));\napp.use(express.json());\napp.use(cookieParser());\napp.get(\"/health\", (_request, response) => response.json({ status: \"ok\" }));\napp.use(\"/auth/register\", authRateLimit);\napp.use(\"/auth/login\", authRateLimit);\napp.use(\"/auth\", authRouter);\napp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {\n  console.error(error);\n  response.status(400).json({ error: \"Invalid request\" });\n});\napp.listen(authConfig.PORT, () => console.log(`API listening on http://localhost:${authConfig.PORT}`));\n",
    "packages/shared/package.json": `${JSON.stringify({
      name: `${packageScope}/shared`, private: true, type: "module",
      exports: "./dist/index.js", types: "./dist/index.d.ts",
      scripts: { build: "tsc -p tsconfig.json", test: "vitest run" },
      devDependencies: { typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "packages/shared/tsconfig.json": `${JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { rootDir: "src", outDir: "dist", declaration: true }, include: ["src"] }, null, 2)}\n`,
    "packages/shared/src/index.ts": "export const serviceName = \"shared\";\n",
    "apps/web/src/index.css": ":root { --ink: #10233f; --cobalt: #2256d7; --signal: #54e0b5; --mist: #f4f7fb; --line: #c8d4e3; --alert: #b42318; color: var(--ink); background: var(--mist); font-family: \"IBM Plex Sans\", system-ui, sans-serif; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-width: 320px; }\nbutton, input { font: inherit; }\nbutton:focus-visible, input:focus-visible { outline: 3px solid var(--signal); outline-offset: 2px; }\n.access-layout { min-height: 100vh; display: grid; grid-template-columns: minmax(18rem, 0.8fr) minmax(24rem, 1fr); background: white; }\n.status-rail { padding: clamp(2rem, 7vw, 7rem); color: white; background: var(--ink); display: flex; flex-direction: column; justify-content: space-between; }\n.status-rail h1, .login-panel h2, .protected-app h1 { letter-spacing: -0.05em; line-height: 0.96; font-size: clamp(2.4rem, 5vw, 5rem); margin: 0; }\n.eyebrow { color: var(--cobalt); font-family: \"IBM Plex Mono\", ui-monospace, monospace; font-size: 0.73rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }\n.status-rail .eyebrow { color: var(--signal); }\n.status-rail dl { margin: 3rem 0 0; display: grid; gap: 1rem; font-family: \"IBM Plex Mono\", ui-monospace, monospace; font-size: 0.8rem; }\n.status-rail dl div { border-top: 1px solid rgba(255,255,255,0.28); padding-top: 0.65rem; display: flex; justify-content: space-between; }\n.status-rail dd { margin: 0; color: var(--signal); }\n.login-panel { padding: clamp(2rem, 8vw, 8rem); max-width: 38rem; width: 100%; margin: auto; }\n.login-copy > p:last-child { color: #53657b; margin-bottom: 2rem; }\nform { display: grid; gap: 1rem; }\nlabel { display: grid; gap: 0.45rem; font-weight: 650; }\ninput { border: 1px solid var(--line); border-radius: 0.25rem; padding: 0.8rem 0.9rem; background: white; }\nbutton { min-height: 2.8rem; border: 0; border-radius: 0.25rem; padding: 0.7rem 1rem; background: var(--cobalt); color: white; cursor: pointer; font-weight: 750; }\nbutton:disabled { cursor: wait; opacity: 0.65; }\n.google-button { width: 100%; background: white; color: var(--ink); border: 1px solid var(--line); }\n.divider { color: #6e7f94; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.8rem; margin: 1.25rem 0; font-size: 0.8rem; }\n.divider::before, .divider::after { content: \"\"; height: 1px; background: var(--line); }\n.form-error { color: var(--alert); margin: 0; font-size: 0.9rem; }\n.loading, .protected-app { min-height: 100vh; padding: clamp(2rem, 10vw, 9rem); display: grid; align-content: center; gap: 1rem; }\n.protected-app { background: var(--mist); }\n.protected-app button { width: fit-content; }\n@media (max-width: 720px) { .access-layout { grid-template-columns: 1fr; } .status-rail { padding: 2rem; min-height: auto; gap: 2rem; } .status-rail h1 { font-size: 2.6rem; } .login-panel { padding: 2.5rem 2rem 4rem; } }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }\n",
    "apps/web/src/auth/AuthProvider.tsx": "import { createContext, useCallback, useContext, useEffect, useMemo, useState } from \"react\";\n\nimport { getCurrentUser, login as loginRequest, logout as logoutRequest, type User } from \"./api\";\n\ninterface AuthState { user: User | null; loading: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void>; }\nconst AuthContext = createContext<AuthState | undefined>(undefined);\n\nexport const AuthProvider = ({ children }: { children: React.ReactNode }) => {\n  const [user, setUser] = useState<User | null>(null);\n  const [loading, setLoading] = useState(true);\n  useEffect(() => { getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);\n  const login = useCallback(async (email: string, password: string) => { setUser(await loginRequest(email, password)); }, []);\n  const logout = useCallback(async () => { await logoutRequest(); setUser(null); }, []);\n  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);\n  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;\n};\n\nexport const useAuth = (): AuthState => { const context = useContext(AuthContext); if (!context) throw new Error(\"useAuth must be inside AuthProvider\"); return context; };\n",
    "apps/web/src/auth/LoginPage.tsx": "import { type FormEvent, useState } from \"react\";\n\nimport { AuthApiError } from \"./api\";\nimport { useAuth } from \"./AuthProvider\";\n\nexport const LoginPage = () => {\n  const { login } = useAuth();\n  const [email, setEmail] = useState(\"\");\n  const [password, setPassword] = useState(\"\");\n  const [error, setError] = useState(\"\");\n  const [submitting, setSubmitting] = useState(false);\n  const submit = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault(); setError(\"\"); setSubmitting(true);\n    try { await login(email, password); }\n    catch (reason) { setError(reason instanceof AuthApiError ? reason.message : \"Unable to sign in\"); }\n    finally { setSubmitting(false); }\n  };\n  return <main className=\"access-layout\"><aside className=\"status-rail\"><p className=\"eyebrow\">Platform access</p><h1>One workspace.<br />Clear control.</h1><dl><div><dt>API</dt><dd>localhost:3001</dd></div><div><dt>Credential</dt><dd>JWT · HttpOnly</dd></div></dl></aside><section className=\"login-panel\"><div className=\"login-copy\"><p className=\"eyebrow\">Secure sign in</p><h2>Welcome back</h2><p>Use your workspace account to continue.</p></div><form onSubmit={submit}><label>Email<input type=\"email\" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete=\"email\" required /></label><label>Password<input type=\"password\" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete=\"current-password\" minLength={12} required /></label>{error && <p className=\"form-error\" role=\"alert\">{error}</p>}<button type=\"submit\" disabled={submitting}>{submitting ? \"Signing in…\" : \"Continue\"}</button></form><div className=\"divider\">or</div><button className=\"google-button\" type=\"button\" onClick={() => window.location.assign(`${import.meta.env.VITE_API_ORIGIN ?? \"http://localhost:3001\"}/auth/google`)}>Continue with Google</button></section></main>;\n};\n",
    "apps/web/src/auth/ProtectedApp.tsx": "import { useAuth } from \"./AuthProvider\";\n\nexport const ProtectedApp = () => { const { user, logout } = useAuth(); return <main className=\"protected-app\"><p className=\"eyebrow\">Authenticated workspace</p><h1>Signed in as {user?.email}</h1><p>Your API session is managed with an HttpOnly cookie.</p><button type=\"button\" onClick={() => void logout()}>Sign out</button></main>; };\n",
    "apps/web/src/App.tsx": "import { AuthProvider, useAuth } from \"./auth/AuthProvider\";\nimport { LoginPage } from \"./auth/LoginPage\";\nimport { ProtectedApp } from \"./auth/ProtectedApp\";\n\nconst AuthGate = () => { const { user, loading } = useAuth(); if (loading) return <main className=\"loading\">Checking secure access…</main>; return user ? <ProtectedApp /> : <LoginPage />; };\nexport default function App() { return <AuthProvider><AuthGate /></AuthProvider>; }\n",
    "apps/web/src/main.tsx": "import { StrictMode } from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport \"./index.css\";\nimport App from \"./App\";\n\ncreateRoot(document.getElementById(\"root\")!).render(<StrictMode><App /></StrictMode>);\n",
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};

const writeMonorepoWebAuthScaffold = async (targetDirectory: string): Promise<void> => {
  const files: Readonly<Record<string, string>> = {
    "apps/web/.env.example": "VITE_API_ORIGIN=http://localhost:3001\n",
    "apps/web/src/auth/api.ts": "const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? \"http://localhost:3001\";\n\nexport interface User { id: string; email: string; }\n\nexport class AuthApiError extends Error {}\n\nconst request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {\n  const response = await fetch(`${apiOrigin}${path}`, { credentials: \"include\", headers: { \"Content-Type\": \"application/json\", ...options.headers }, ...options });\n  if (!response.ok) {\n    const body: unknown = await response.json().catch(() => undefined);\n    const message = typeof body === \"object\" && body !== null && \"error\" in body && typeof body.error === \"string\" ? body.error : \"Unable to complete this request\";\n    throw new AuthApiError(message);\n  }\n  return response.status === 204 ? undefined as T : response.json() as Promise<T>;\n};\n\nexport const getCurrentUser = async (): Promise<User | null> => {\n  const response = await fetch(`${apiOrigin}/auth/me`, { credentials: \"include\" });\n  if (response.status === 401) return null;\n  if (!response.ok) throw new AuthApiError(\"Unable to check your sign-in status\");\n  return (await response.json() as { user: User }).user;\n};\n\nexport const login = async (email: string, password: string): Promise<User> => (await request<{ user: User }>(\"/auth/login\", { method: \"POST\", body: JSON.stringify({ email, password }) })).user;\nexport const logout = (): Promise<void> => request<void>(\"/auth/logout\", { method: \"POST\" });\n",
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};

export const planCreate = async (input: CreateInput): Promise<CreatePlan> => {
  if (!validName.test(input.name)) {
    throw new RepositoryStandardError("CONFIG_INVALID", "Project name must use letters, numbers, and hyphens.");
  }

  const targetDirectory = path.resolve(input.targetDirectory);
  if (existsSync(targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${targetDirectory}.`);
  }

  const registry = await loadRegistry(input.registryRoot);
  if (registry.get("project-type", input.projectType) === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Project type "${input.projectType}" is not available.`);
  }

  const preset = input.preset === undefined ? undefined : registry.get("preset", input.preset);
  if (input.preset !== undefined && preset === undefined) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Preset "${input.preset}" is not available.`);
  }
  const supportedProjectTypes = preset?.compatibility?.projectTypes;
  if (Array.isArray(supportedProjectTypes) && !supportedProjectTypes.includes(input.projectType)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Preset "${input.preset}" is not compatible with ${input.projectType}.`);
  }

  const config: RepoConfig = {
    schemaVersion: 1,
    plugin: { id: "repo-standard", version: "0.1.0" },
    project: { name: input.name, type: input.projectType, root: "." },
    composition: { ...(preset === undefined ? {} : { preset: `${preset.id}@${preset.version}` }), stack: { ...preset?.selection?.stack, ...input.stack }, capabilities: [...input.capabilities] },
    agents: input.projectType === "monorepo"
      ? { mode: input.agentMode, enabled: monorepoAgentIds, adapters: ["codex"] }
      : { mode: input.agentMode, enabled: [], adapters: [] },
    flows: { defaults: [] },
    standards: { overrides: [] },
    managed: { stateFile: ".repo-standard/managed-state.yaml" }
  };

  return {
    targetDirectory,
    config,
    operations: ["write-config", "write-managed-state"],
    preview: `Create ${input.name} (${input.projectType}) at ${targetDirectory}.`
  };
};

export const applyCreatePlan = async (plan: CreatePlan, runner: GeneratorRunner = defaultGeneratorRunner): Promise<void> => {
  if (existsSync(plan.targetDirectory)) {
    throw new RepositoryStandardError("CONFIG_INVALID", `Target directory already exists: ${plan.targetDirectory}.`);
  }

  await mkdir(plan.targetDirectory, { recursive: false });
  if (plan.config.project.type === "monorepo") {
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await runner.run(pnpm, ["create", "vite", "apps/web", "--template", "react-ts", "--no-interactive"], plan.targetDirectory);
    await writeMonorepoScaffold(plan.targetDirectory, plan.config.project.name);
    await writeMonorepoWebAuthScaffold(plan.targetDirectory);
    await runner.run(pnpm, ["install"], plan.targetDirectory);
    await runner.run(pnpm, ["--filter", "./apps/api", "exec", "prisma", "generate"], plan.targetDirectory);
  } else if (plan.config.composition.stack.framework === "vite@8") {
    await runner.run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["create", "vite", ".", "--template", "react-ts", "--no-interactive"], plan.targetDirectory);
  }
  const configPath = path.join(plan.targetDirectory, "repo.config.yaml");
  const configText = stringify(plan.config);
  await writeYamlAtomically(configPath, plan.config);
  await writeYamlAtomically(path.join(plan.targetDirectory, ".repo-standard", "managed-state.yaml"), createManagedState(configText));
};
