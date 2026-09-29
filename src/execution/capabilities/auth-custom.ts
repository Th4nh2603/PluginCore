import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { backendFiles } from "../templates/backend.js";
import { frontendFiles } from "../templates/frontend.js";
import { customFrontendAuthentication } from "./auth-custom-frontend.js";
import { customBackendAuthentication } from "./auth-custom-backend.js";
import { initialUserBootstrapSource } from "./auth-custom-bootstrap.js";

export const customFrontendFiles = (name: string, frontend: string): Record<string, string> => frontendFiles(name, frontend, customFrontendAuthentication);
export const customBackendFiles = (name: string, backend: string, orm: string): Record<string, string> => backendFiles(name, backend, orm, customBackendAuthentication);
export const customEnvironment = (): string => `JWT_SECRET=${randomBytes(32).toString("hex")}\n`;
export const customReadmeSetup = "";
export const customReadmeEnd = "\nFor interactive Custom Authentication creation, the CLI displays the fixed initial username admin and asks for a hidden password twice, repeating the prompts until the 12–128 character password is valid and confirmed. A one-time salted scrypt hash is stored in .repo-standard/initial-user.json. After db:push, start the API to create that user; the file is removed after a successful seed. If PostgreSQL is unavailable, keep the file and retry startup. You can also register users in the web form. Sessions use HttpOnly cookies. The JWT secret is generated per project; use your deployment secret store in production.\n";

const legacyPasswordSource = `import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return salt + ":" + hash.toString("hex");
};
export const verifyPassword = async (stored: string, password: string): Promise<boolean> => {
  const [salt, value] = stored.split(":");
  if (!salt || !value || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(value)) return false;
  const hash = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(hash, Buffer.from(value, "hex"));
};
`;

export const writeMonorepoWebAuthScaffold = async (targetDirectory: string): Promise<void> => {
  const files: Readonly<Record<string, string>> = {
    "apps/web/.env.example": "VITE_API_ORIGIN=http://localhost:3001\n",
    "apps/web/src/auth/api.ts": "const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? \"http://localhost:3001\";\n\nexport interface User { id: string; username: string; }\n\nexport class AuthApiError extends Error {}\n\nconst request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {\n  const response = await fetch(`${apiOrigin}${path}`, { credentials: \"include\", headers: { \"Content-Type\": \"application/json\", ...options.headers }, ...options });\n  if (!response.ok) {\n    const body: unknown = await response.json().catch(() => undefined);\n    const message = typeof body === \"object\" && body !== null && \"error\" in body && typeof body.error === \"string\" ? body.error : \"Unable to complete this request\";\n    throw new AuthApiError(message);\n  }\n  return response.status === 204 ? undefined as T : response.json() as Promise<T>;\n};\n\nexport const getCurrentUser = async (): Promise<User | null> => {\n  const response = await fetch(`${apiOrigin}/auth/me`, { credentials: \"include\" });\n  if (response.status === 401) return null;\n  if (!response.ok) throw new AuthApiError(\"Unable to check your sign-in status\");\n  return (await response.json() as { user: User }).user;\n};\n\nexport const login = async (username: string, password: string): Promise<User> => (await request<{ user: User }>(\"/auth/login\", { method: \"POST\", body: JSON.stringify({ username, password }) })).user;\nexport const logout = (): Promise<void> => request<void>(\"/auth/logout\", { method: \"POST\" });\n",
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};

export const writeLegacyCustomAuthentication = async (targetDirectory: string, name: string): Promise<void> => {
  const packageScope = `@${name}`;
  const files: Readonly<Record<string, string>> = {
    "README.md": `# ${name}

## Start

1. Start PostgreSQL: \`docker compose up -d\`.
2. Check \`apps/api/.env\` and set DATABASE_URL if needed.
3. Apply the schema: \`pnpm --filter ./apps/api db:push\`.
4. Start the API and web app: \`pnpm dev\`.

An interactive Custom Authentication install stores the first username as a one-time salted scrypt hash in \`.repo-standard/initial-user.json\`. The API creates that user before listening and deletes the file after success. If the database is unavailable, keep the file and restart after fixing PostgreSQL. No initial user file is created by noninteractive installs. Other accounts can register through the web form.
`,
    "apps/api/package.json": `${JSON.stringify({
      name: `${packageScope}/api`, private: true, type: "module",
      scripts: { dev: "tsx watch src/server.ts", build: "tsc -p tsconfig.json", start: "node dist/server.js", test: "vitest run", "db:push": "prisma db push", "db:generate": "prisma generate", "db:migrate": "prisma migrate dev" },
      dependencies: { [`${packageScope}/shared`]: "workspace:*", "@prisma/client": "^6.19.3", "cookie-parser": "^1.4.7", cors: "^2.8.5", dotenv: "^17.4.2", express: "^5.1.0", "express-rate-limit": "^8.7.0", helmet: "^8.3.0", jose: "^6.2.12", zod: "^4.6.5" },
      devDependencies: { "@types/cookie-parser": "^1.4.10", "@types/cors": "^2.8.19", "@types/express": "^5.0.1", "@types/node": "^22.18.12", prisma: "^6.19.3", tsx: "^4.20.5", typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "apps/api/.env.example": "DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public\nJWT_SECRET=replace-with-a-long-random-secret\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\nNODE_ENV=development\n",
    "apps/api/.env": `DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public\n${customEnvironment()}WEB_ORIGIN=http://localhost:5173\nPORT=3001\nNODE_ENV=development\n`,
    "apps/api/src/auth/config.ts": "import { z } from \"zod\";\n\nconst environment = z.object({\n  DATABASE_URL: z.string().url(),\n  JWT_SECRET: z.string().min(32),\n  WEB_ORIGIN: z.string().url(),\n  PORT: z.coerce.number().int().positive().default(3001),\n  NODE_ENV: z.enum([\"development\", \"test\", \"production\"]).default(\"development\")\n});\n\nexport const authConfig = environment.parse(process.env);\n",
    "apps/api/src/auth/password.ts": legacyPasswordSource,
    "apps/api/src/auth/bootstrap.ts": initialUserBootstrapSource,
    "apps/api/src/auth/token.ts": "import { jwtVerify, SignJWT } from \"jose\";\n\nimport { authConfig } from \"./config.js\";\n\nexport interface AuthUser { id: string; username: string; }\n\nconst secret = new TextEncoder().encode(authConfig.JWT_SECRET);\nexport const issueAccessToken = (user: AuthUser): Promise<string> => new SignJWT({ username: user.username }).setProtectedHeader({ alg: \"HS256\" }).setSubject(user.id).setIssuedAt().setExpirationTime(\"15m\").sign(secret);\nexport const verifyAccessToken = async (token: string): Promise<AuthUser> => {\n  const { payload } = await jwtVerify(token, secret);\n  if (typeof payload.sub !== \"string\" || typeof payload.username !== \"string\") throw new Error(\"Invalid token payload.\");\n  return { id: payload.sub, username: payload.username };\n};\n",
    "apps/api/src/auth/prisma.ts": "import { PrismaClient } from \"@prisma/client\";\n\nexport const prisma = new PrismaClient();\n",
    "apps/api/src/auth/middleware.ts": "import type { RequestHandler } from \"express\";\n\nimport { verifyAccessToken } from \"./token.js\";\n\nexport const requireAuth: RequestHandler = async (request, response, next) => {\n  const token = request.cookies.access_token;\n  if (typeof token !== \"string\") { response.status(401).json({ error: \"Unauthorized\" }); return; }\n  try { response.locals.authUser = await verifyAccessToken(token); next(); }\n  catch { response.status(401).json({ error: \"Unauthorized\" }); }\n};\n",
    "apps/api/src/auth/router.ts": "import { Router } from \"express\";\nimport { z } from \"zod\";\n\nimport { authConfig } from \"./config.js\";\nimport { requireAuth } from \"./middleware.js\";\nimport { hashPassword, verifyPassword } from \"./password.js\";\nimport { prisma } from \"./prisma.js\";\nimport { issueAccessToken } from \"./token.js\";\n\nconst credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/), password: z.string().min(12).max(128) });\nconst cookieOptions = { httpOnly: true, sameSite: \"lax\" as const, secure: authConfig.NODE_ENV === \"production\", path: \"/\", maxAge: 15 * 60 * 1000 };\nconst publicUser = (user: { id: string; username: string }) => ({ id: user.id, username: user.username });\nexport const authRouter = Router();\n\nauthRouter.post(\"/register\", async (request, response, next) => {\n  try {\n    const input = credentials.parse(request.body);\n    const existing = await prisma.user.findUnique({ where: { username: input.username } });\n    if (existing) { response.status(409).json({ error: \"Unable to create account\" }); return; }\n    const user = await prisma.user.create({ data: { username: input.username, passwordHash: await hashPassword(input.password) } });\n    response.status(201).json({ user: publicUser(user) });\n  } catch (error) { next(error); }\n});\n\nauthRouter.post(\"/login\", async (request, response, next) => {\n  try {\n    const input = credentials.parse(request.body);\n    const user = await prisma.user.findUnique({ where: { username: input.username } });\n    if (!user?.passwordHash || !await verifyPassword(user.passwordHash, input.password)) { response.status(401).json({ error: \"Invalid username or password\" }); return; }\n    response.cookie(\"access_token\", await issueAccessToken(user), cookieOptions).json({ user: publicUser(user) });\n  } catch (error) { next(error); }\n});\n\nauthRouter.post(\"/logout\", (_request, response) => response.clearCookie(\"access_token\", cookieOptions).status(204).end());\nauthRouter.get(\"/me\", requireAuth, (request, response) => response.json({ user: response.locals.authUser }));\n",
    "apps/api/src/auth/router.test.ts": "import { describe, expect, it } from \"vitest\";\n\nconst routes = [\"POST /auth/register\", \"POST /auth/login\", \"POST /auth/logout\", \"GET /auth/me\"];\n\ndescribe(\"auth route contract\", () => {\n  it(\"includes registration and current-user endpoints\", () => {\n    expect(routes).toContain(\"POST /auth/register\");\n    expect(routes).toContain(\"GET /auth/me\");\n  });\n});\n",
    "apps/api/src/server.ts": "import \"dotenv/config\";\n\nimport cookieParser from \"cookie-parser\";\nimport cors from \"cors\";\nimport express from \"express\";\nimport rateLimit from \"express-rate-limit\";\nimport helmet from \"helmet\";\n\nimport { authConfig } from \"./auth/config.js\";\nimport { authRouter } from \"./auth/router.js\";\nimport { bootstrapInitialUser } from \"./auth/bootstrap.js\";\nimport { prisma } from \"./auth/prisma.js\";\n\nconst app = express();\nconst authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: \"draft-8\", legacyHeaders: false });\napp.use(helmet());\napp.use(cors({ origin: authConfig.WEB_ORIGIN, credentials: true }));\napp.use(express.json());\napp.use(cookieParser());\napp.get(\"/health\", (_request, response) => response.json({ status: \"ok\" }));\napp.use(\"/auth/register\", authRateLimit);\napp.use(\"/auth/login\", authRateLimit);\napp.use(\"/auth\", authRouter);\napp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {\n  console.error(\"Authentication request failed\");\n  response.status(400).json({ error: \"Invalid request\" });\n});\nawait bootstrapInitialUser((username) => prisma.user.findUnique({ where: { username } }), (username, passwordHash) => prisma.user.create({ data: { username, passwordHash } }));\napp.listen(authConfig.PORT, () => console.log(`API listening on http://localhost:${authConfig.PORT}`));\n",
    "apps/web/src/auth/AuthProvider.tsx": "import { createContext, useCallback, useContext, useEffect, useMemo, useState } from \"react\";\n\nimport { getCurrentUser, login as loginRequest, logout as logoutRequest, type User } from \"./api\";\n\ninterface AuthState { user: User | null; loading: boolean; login(username: string, password: string): Promise<void>; logout(): Promise<void>; }\nconst AuthContext = createContext<AuthState | undefined>(undefined);\n\nexport const AuthProvider = ({ children }: { children: React.ReactNode }) => {\n  const [user, setUser] = useState<User | null>(null);\n  const [loading, setLoading] = useState(true);\n  useEffect(() => { getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);\n  const login = useCallback(async (username: string, password: string) => { setUser(await loginRequest(username, password)); }, []);\n  const logout = useCallback(async () => { await logoutRequest(); setUser(null); }, []);\n  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);\n  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;\n};\n\nexport const useAuth = (): AuthState => { const context = useContext(AuthContext); if (!context) throw new Error(\"useAuth must be inside AuthProvider\"); return context; };\n",
    "apps/web/src/auth/LoginPage.tsx": "import { type FormEvent, useState } from \"react\";\n\nimport { AuthApiError } from \"./api\";\nimport { useAuth } from \"./AuthProvider\";\n\nexport const LoginPage = () => {\n  const { login } = useAuth();\n  const [username, setUsername] = useState(\"\");\n  const [password, setPassword] = useState(\"\");\n  const [error, setError] = useState(\"\");\n  const [submitting, setSubmitting] = useState(false);\n  const submit = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault(); setError(\"\"); setSubmitting(true);\n    try { await login(username, password); }\n    catch (reason) { setError(reason instanceof AuthApiError ? reason.message : \"Unable to sign in\"); }\n    finally { setSubmitting(false); }\n  };\n  return <main className=\"access-layout\"><aside className=\"status-rail\"><p className=\"eyebrow\">Platform access</p><h1>One workspace.<br />Clear control.</h1><dl><div><dt>API</dt><dd>localhost:3001</dd></div><div><dt>Credential</dt><dd>JWT · HttpOnly</dd></div></dl></aside><section className=\"login-panel\"><div className=\"login-copy\"><p className=\"eyebrow\">Secure sign in</p><h2>Welcome back</h2><p>Use your workspace account to continue.</p></div><form onSubmit={submit}><label>Username<input type=\"text\" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete=\"username\" required /></label><label>Password<input type=\"password\" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete=\"current-password\" minLength={12} required /></label>{error && <p className=\"form-error\" role=\"alert\">{error}</p>}<button type=\"submit\" disabled={submitting}>{submitting ? \"Signing in…\" : \"Continue\"}</button></form><div className=\"divider\">or</div><button className=\"google-button\" type=\"button\" onClick={() => window.location.assign(`${import.meta.env.VITE_API_ORIGIN ?? \"http://localhost:3001\"}/auth/google`)}>Continue with Google</button></section></main>;\n};\n",
    "apps/web/src/auth/ProtectedApp.tsx": "import { useAuth } from \"./AuthProvider\";\n\nexport const ProtectedApp = () => { const { user, logout } = useAuth(); return <main className=\"protected-app\"><p className=\"eyebrow\">Authenticated workspace</p><h1>Signed in as {user?.username}</h1><p>Your API session is managed with an HttpOnly cookie.</p><button type=\"button\" onClick={() => void logout()}>Sign out</button></main>; };\n",
    "apps/web/src/App.tsx": "import { AuthProvider, useAuth } from \"./auth/AuthProvider\";\nimport { LoginPage } from \"./auth/LoginPage\";\nimport { ProtectedApp } from \"./auth/ProtectedApp\";\n\nconst AuthGate = () => { const { user, loading } = useAuth(); if (loading) return <main className=\"loading\">Checking secure access…</main>; return user ? <ProtectedApp /> : <LoginPage />; };\nexport default function App() { return <AuthProvider><AuthGate /></AuthProvider>; }\n",
    "apps/web/src/main.tsx": "import { StrictMode } from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport \"./index.css\";\nimport App from \"./App\";\n\ncreateRoot(document.getElementById(\"root\")!).render(<StrictMode><App /></StrictMode>);\n",
  };
  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
  await writeMonorepoWebAuthScaffold(targetDirectory);
};
