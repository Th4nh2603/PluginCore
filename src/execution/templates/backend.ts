import { databaseFiles } from "./database.js";

export interface BackendAuthentication {
  readonly dependencies: (fastify: boolean) => Readonly<Record<string, string>>;
  readonly devDependencies: (fastify: boolean) => Readonly<Record<string, string>>;
  readonly imports: string;
  readonly fastifyImports: string;
  readonly fastifyRoutes: string;
  readonly expressImports: string;
  readonly expressRoutes: string;
  readonly expressError: string;
  readonly files: Readonly<Record<string, string>>;
}

export const backendFiles = (name: string, backend: string, orm: string, authentication?: BackendAuthentication, mcpEnabled = false): Record<string, string> => {
  const fastify = backend === "fastify";
  const dependencies: Record<string, string> = {
    dotenv: "^17.4.2",
    ...(fastify ? { fastify: "^5.12.5", "@fastify/cors": "^11.3.0", "@fastify/helmet": "^13.1.1" } : { express: "^5.1.0", cors: "^2.8.5", helmet: "^8.3.0" }),
    ...(orm === "drizzle" ? { "drizzle-orm": "^0.45.2", pg: "^8.23.0" } : { "@prisma/client": "^6.19.3" }),
    ...authentication?.dependencies(fastify)
  };
  const imports = authentication?.imports ?? "";
  const healthImport = mcpEnabled ? 'import { getHealth } from "./health.js";\n' : "";
  const fastifyHealthRoute = mcpEnabled ? '  app.get("/health", async () => getHealth());' : '  app.get("/health", async () => ({ status: "ok" }));';
  const expressHealthRoute = mcpEnabled ? '  app.get("/health", (_request, response) => response.json(getHealth()));' : '  app.get("/health", (_request, response) => response.json({ status: "ok" }));';
  const fastifyApp = `import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
${healthImport}
${authentication?.fastifyImports ?? "\n"}
${imports}
export const buildApp = async () => {
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(cors, { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true });
${fastifyHealthRoute}
${authentication?.fastifyRoutes ?? "\n"}
  return app;
};
`;
  const expressApp = `import express from "express";
import cors from "cors";
import helmet from "helmet";
${healthImport}
${authentication?.expressImports ?? "\n"}
${imports}
export const buildApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(express.json());
${expressHealthRoute}
${authentication?.expressRoutes ?? "\n"}
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
${authentication?.expressError ?? ""}
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
      ...(fastify ? {} : { "@types/express": "^5.0.1", "@types/cors": "^2.8.19", ...authentication?.devDependencies(fastify) }),
      ...(orm === "drizzle" ? { "drizzle-kit": "^0.31.10", "@types/pg": "^8.23.1" } : { prisma: "^6.19.3" })
    } }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true, esModuleInterop: true, rootDir: "src", outDir: "dist" }, include: ["src"] }, null, 2),
    "src/app.ts": fastify ? fastifyApp : expressApp,
    ...(mcpEnabled ? { "src/health.ts": 'export const getHealth = () => ({ status: "ok" as const });\n' } : {}),
    "src/server.ts": `import { buildApp } from "./app.js";
const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
${fastify ? 'await app.listen({ port, host: "127.0.0.1" });' : 'app.listen(port, "127.0.0.1", () => console.log("API listening on http://localhost:" + port));'}
`,
    ...databaseFiles(orm),
    ...authentication?.files
  };
};
