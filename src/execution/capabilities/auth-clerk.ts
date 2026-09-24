import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { backendFiles } from "../templates/backend.js";
import { frontendFiles } from "../templates/frontend.js";
import { clerkFrontendAuthentication } from "./auth-clerk-frontend.js";
import { clerkBackendAuthentication } from "./auth-clerk-backend.js";

export const clerkFrontendFiles = (name: string, frontend: string): Record<string, string> => frontendFiles(name, frontend, clerkFrontendAuthentication);
export const clerkBackendFiles = (name: string, backend: string, orm: string, mcpEnabled = false): Record<string, string> => backendFiles(name, backend, orm, clerkBackendAuthentication, mcpEnabled);
export const clerkEnvironment = (): string => "CLERK_SECRET_KEY=\nCLERK_PUBLISHABLE_KEY=\n";
export const clerkReadmeSetup = "\nSet CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY in apps/api/.env. Copy apps/web/.env.example to apps/web/.env and set VITE_CLERK_PUBLISHABLE_KEY.\n";
export const clerkReadmeEnd = "\nThe ORM is available for application data; Clerk manages authentication separately.\n";

export const writeMonorepoClerkScaffold = async (targetDirectory: string, name: string, mcpEnabled = false): Promise<void> => {
  const packageScope = `@${name}`;
  const healthImport = mcpEnabled ? 'import { getHealth } from "./health.js";\n' : "";
  const healthRoute = mcpEnabled
    ? 'app.get("/health", (_request, response) => response.json(getHealth()));'
    : 'app.get("/health", (_request, response) => response.json({ status: "ok" }));';
  await Promise.all([
    rm(path.join(targetDirectory, "apps", "api", "src", "auth"), { recursive: true, force: true }),
    rm(path.join(targetDirectory, "apps", "web", "src", "auth"), { recursive: true, force: true })
  ]);

  const files: Readonly<Record<string, string>> = {
    ...(mcpEnabled ? { "apps/api/src/health.ts": 'export const getHealth = () => ({ status: "ok" as const });\n' } : {}),
    "apps/api/package.json": `${JSON.stringify({
      name: `${packageScope}/api`, private: true, type: "module",
      scripts: { dev: "tsx watch src/server.ts", build: "tsc -p tsconfig.json", start: "node dist/server.js", test: "vitest run" },
      dependencies: { [`${packageScope}/shared`]: "workspace:*", "@clerk/express": "^2.1.69", "@prisma/client": "^6.19.3", cors: "^2.8.5", dotenv: "^17.4.2", express: "^5.1.0", helmet: "^8.3.0" },
      devDependencies: { "@types/cors": "^2.8.19", "@types/express": "^5.0.1", "@types/node": "^22.18.12", prisma: "^6.19.3", tsx: "^4.20.5", typescript: "^5.9.3", vitest: "^4.1.11" }
    }, null, 2)}\n`,
    "apps/api/.env.example": "CLERK_SECRET_KEY=sk_test_replace_with_your_clerk_secret_key\nCLERK_PUBLISHABLE_KEY=pk_test_replace_with_your_clerk_publishable_key\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\n",
    "apps/api/.env": "CLERK_SECRET_KEY=\nCLERK_PUBLISHABLE_KEY=\nWEB_ORIGIN=http://localhost:5173\nPORT=3001\n",
    "apps/api/src/server.ts": "import \"dotenv/config\";\n\nimport { clerkMiddleware, getAuth } from \"@clerk/express\";\nimport cors from \"cors\";\nimport express from \"express\";\nimport helmet from \"helmet\";\n\n" + healthImport + "const app = express();\napp.use(helmet());\napp.use(cors({ origin: process.env.WEB_ORIGIN ?? \"http://localhost:5173\" }));\napp.use(express.json());\napp.use(clerkMiddleware());\n" + healthRoute + "\napp.get(\"/auth/me\", (request, response) => { const { isAuthenticated, userId } = getAuth(request); if (!isAuthenticated || !userId) { response.status(401).json({ error: \"Unauthorized\" }); return; } response.json({ userId }); });\napp.listen(Number(process.env.PORT ?? 3001), () => console.log(\"API listening on http://localhost:3001\"));\n",
    "apps/web/package.json": `${JSON.stringify({
      name: `${packageScope}/web`, private: true, type: "module",
      scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
      dependencies: { "@clerk/react": "^6.16.1", react: "^19.2.0", "react-dom": "^19.2.0" },
      devDependencies: { "@types/node": "^22.18.12", "@types/react": "^19.2.2", "@types/react-dom": "^19.2.2", "@vitejs/plugin-react": "^5.0.4", typescript: "^5.9.3", vite: "^8.0.0" }
    }, null, 2)}\n`,
    "apps/web/.env.example": "VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_with_your_clerk_publishable_key\nVITE_CLERK_SIGN_IN_URL=/sign-in\n",
    "apps/web/src/App.tsx": "import { RedirectToSignIn, Show, SignIn, UserButton, useAuth } from \"@clerk/react\";\nimport { useState } from \"react\";\n\nconst apiOrigin = import.meta.env.VITE_API_ORIGIN ?? \"http://localhost:3001\";\nconst signInUrl = import.meta.env.VITE_CLERK_SIGN_IN_URL ?? \"/sign-in\";\n\nconst SignInPage = () => <main><SignIn path={signInUrl} /></main>;\n\nconst AuthenticatedWorkspace = () => {\n  const { getToken, isLoaded, isSignedIn, userId } = useAuth();\n  const [apiUserId, setApiUserId] = useState<string>();\n  const [error, setError] = useState<string>();\n  const [checking, setChecking] = useState(false);\n  const verifyApiSession = async () => {\n    setChecking(true); setError(undefined);\n    try {\n      const token = await getToken();\n      if (!token) throw new Error(\"No Clerk session token is available.\");\n      const response = await fetch(`${apiOrigin}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });\n      if (!response.ok) throw new Error(\"The API could not verify your Clerk session.\");\n      setApiUserId((await response.json() as { userId: string }).userId);\n    } catch (reason) { setError(reason instanceof Error ? reason.message : \"Unable to verify the API session.\"); }\n    finally { setChecking(false); }\n  };\n  if (!isLoaded || !isSignedIn) return null;\n  return <section><UserButton /><h1>Authenticated workspace</h1><p>Signed in to Clerk as {userId}.</p><button type=\"button\" onClick={() => void verifyApiSession()} disabled={checking}>{checking ? \"Checking API…\" : \"Verify API session\"}</button>{apiUserId && <p>API verified user: {apiUserId}</p>}{error && <p role=\"alert\">{error}</p>}</section>;\n};\n\nexport default function App() {\n  const path = window.location.pathname;\n  if (path === signInUrl || path.startsWith(`${signInUrl}/`)) return <SignInPage />;\n  return <main><Show when=\"signed-out\"><RedirectToSignIn /></Show><Show when=\"signed-in\"><AuthenticatedWorkspace /></Show></main>;\n}\n",
    "apps/web/src/main.tsx": "import { StrictMode } from \"react\";\nimport { createRoot } from \"react-dom/client\";\nimport { ClerkProvider } from \"@clerk/react\";\nimport \"./index.css\";\nimport App from \"./App\";\n\nconst publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;\nconst signInUrl = import.meta.env.VITE_CLERK_SIGN_IN_URL ?? \"/sign-in\";\nif (!publishableKey) throw new Error(\"Set VITE_CLERK_PUBLISHABLE_KEY in .env\");\ncreateRoot(document.getElementById(\"root\")!).render(<StrictMode><ClerkProvider publishableKey={publishableKey} signInUrl={signInUrl} signInFallbackRedirectUrl=\"/\" signUpFallbackRedirectUrl=\"/\"><App /></ClerkProvider></StrictMode>);\n"
  };

  await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
    const filePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }));
};
