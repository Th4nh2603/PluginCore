import { authenticationFiles } from "./auth.js";
import { databaseFiles } from "./database.js";

export const backendFiles = (name: string, backend: string, orm: string, authentication?: string): Record<string, string> => {
  const fastify = backend === "fastify";
  const custom = authentication === "custom";
  const clerk = authentication === "clerk";
  const dependencies: Record<string, string> = {
    dotenv: "^17.4.2",
    ...(fastify ? { fastify: "^5.12.5", "@fastify/cors": "^11.3.0", "@fastify/helmet": "^13.1.1" } : { express: "^5.1.0", cors: "^2.8.5", helmet: "^8.3.0" }),
    ...(orm === "drizzle" ? { "drizzle-orm": "^0.45.2", pg: "^8.23.0" } : { "@prisma/client": "^6.19.3" }),
    ...(custom ? { jose: "^6.2.12", zod: "^4.6.5", ...(fastify ? { "@fastify/cookie": "^11.1.2", "@fastify/rate-limit": "^11.2.0" } : { "cookie-parser": "^1.4.7", "express-rate-limit": "^8.7.0" }) } : {}),
    ...(clerk ? (fastify ? { "@clerk/fastify": "^3.1.79" } : { "@clerk/express": "^2.1.69" }) : {})
  };
  const imports = custom ? 'import { register, login, currentUser, cookieOptions, AuthError } from "./auth/service.js";\n' : "";
  const fastifyApp = `import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
${custom ? 'import cookie from "@fastify/cookie";\nimport rateLimit from "@fastify/rate-limit";' : ""}
${clerk ? 'import { clerkPlugin, getAuth } from "@clerk/fastify";' : ""}
${imports}
export const buildApp = async () => {
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(cors, { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true });
  app.get("/health", async () => ({ status: "ok" }));
${custom ? `  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const limited = { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } };
  app.post("/auth/register", limited, async (request, reply) => reply.code(201).send({ user: await register(request.body) }));
  app.post("/auth/login", limited, async (request, reply) => {
    const session = await login(request.body);
    return reply.setCookie("access_token", session.token, { ...cookieOptions, maxAge: 900 }).send({ user: session.user });
  });
  app.get("/auth/me", async (request) => ({ user: await currentUser(request.cookies.access_token) }));
  app.post("/auth/logout", async (_request, reply) => reply.clearCookie("access_token", cookieOptions).code(204).send());
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
    if (error instanceof Error && "statusCode" in error && error.statusCode === 429) return reply.code(429).send({ error: "Too many requests" });
    request.log.error(error);
    return reply.code(500).send({ error: "Unable to complete request" });
  });` : ""}
${clerk ? `  await app.register(clerkPlugin);
  app.get("/auth/me", async (request, reply) => {
    const { isAuthenticated, userId } = getAuth(request);
    if (!isAuthenticated || !userId) return reply.code(401).send({ error: "Unauthorized" });
    return { userId };
  });` : ""}
  return app;
};
`;
  const expressApp = `import express from "express";
import cors from "cors";
import helmet from "helmet";
${custom ? 'import cookieParser from "cookie-parser";\nimport rateLimit from "express-rate-limit";' : ""}
${clerk ? 'import { clerkMiddleware, getAuth } from "@clerk/express";' : ""}
${imports}
export const buildApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
${custom ? `  app.use(cookieParser());
  const limited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
  app.post("/auth/register", limited, async (request, response) => response.status(201).json({ user: await register(request.body) }));
  app.post("/auth/login", limited, async (request, response) => {
    const session = await login(request.body);
    response.cookie("access_token", session.token, { ...cookieOptions, maxAge: 900_000 }).json({ user: session.user });
  });
  app.get("/auth/me", async (request, response) => response.json({ user: await currentUser(request.cookies.access_token) }));
  app.post("/auth/logout", (_request, response) => response.clearCookie("access_token", cookieOptions).status(204).end());` : ""}
${clerk ? `  app.use(clerkMiddleware());
  app.get("/auth/me", (request, response) => {
    const { isAuthenticated, userId } = getAuth(request);
    if (!isAuthenticated || !userId) { response.status(401).json({ error: "Unauthorized" }); return; }
    response.json({ userId });
  });` : ""}
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
${custom ? '    if (error instanceof AuthError) { response.status(error.status).json({ error: error.message }); return; }' : ""}
    console.error(error);
    response.status(500).json({ error: "Unable to complete request" });
  });
  return app;
};
`;
  return {
    "package.json": JSON.stringify({ name, private: true, type: "module", scripts: {
      dev: "tsx watch --env-file=.env src/server.ts", build: "tsc -p tsconfig.json", start: "node --env-file=.env dist/server.js",
      "db:generate": orm === "drizzle" ? "drizzle-kit generate" : "prisma generate",
      "db:migrate": orm === "drizzle" ? "drizzle-kit migrate" : "prisma migrate dev",
      "db:push": orm === "drizzle" ? "drizzle-kit push" : "prisma db push"
    }, dependencies, devDependencies: { "@types/node": "^22.18.12", tsx: "^4.20.5", typescript: "^5.9.3",
      ...(fastify ? {} : { "@types/express": "^5.0.1", "@types/cors": "^2.8.19", ...(custom ? { "@types/cookie-parser": "^1.4.10" } : {}) }),
      ...(orm === "drizzle" ? { "drizzle-kit": "^0.31.10", "@types/pg": "^8.23.1" } : { prisma: "^6.19.3" })
    } }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true, esModuleInterop: true, rootDir: "src", outDir: "dist" }, include: ["src"] }, null, 2),
    "src/app.ts": fastify ? fastifyApp : expressApp,
    "src/server.ts": `import { buildApp } from "./app.js";
const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
${fastify ? 'await app.listen({ port, host: "127.0.0.1" });' : 'app.listen(port, "127.0.0.1", () => console.log("API listening on http://localhost:" + port));'}
`,
    ...databaseFiles(orm),
    ...(custom ? authenticationFiles : {})
  };
};
