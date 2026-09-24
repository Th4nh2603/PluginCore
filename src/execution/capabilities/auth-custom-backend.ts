import type { BackendAuthentication } from "../templates/backend.js";
import { authenticationFiles } from "./auth-custom-files.js";

const fastifyRoutes = `  await app.register(cookie);
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
  });`;
const expressRoutes = `  app.use(cookieParser());
  const limited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
  app.post("/auth/register", limited, async (request, response) => response.status(201).json({ user: await register(request.body) }));
  app.post("/auth/login", limited, async (request, response) => {
    const session = await login(request.body);
    response.cookie("access_token", session.token, { ...cookieOptions, maxAge: 900_000 }).json({ user: session.user });
  });
  app.get("/auth/me", async (request, response) => response.json({ user: await currentUser(request.cookies.access_token) }));
  app.post("/auth/logout", (_request, response) => response.clearCookie("access_token", cookieOptions).status(204).end());`;

export const customBackendAuthentication: BackendAuthentication = {
  dependencies: (fastify) => ({ jose: "^6.2.12", zod: "^4.6.5", ...(fastify ? { "@fastify/cookie": "^11.1.2", "@fastify/rate-limit": "^11.2.0" } : { "cookie-parser": "^1.4.7", "express-rate-limit": "^8.7.0" }) }),
  devDependencies: (fastify) => fastify ? {} : { "@types/cookie-parser": "^1.4.10" },
  imports: 'import { register, login, currentUser, cookieOptions, AuthError } from "./auth/service.js";\n',
  fastifyImports: 'import cookie from "@fastify/cookie";\nimport rateLimit from "@fastify/rate-limit";\n',
  fastifyRoutes: fastifyRoutes + "\n",
  expressImports: 'import cookieParser from "cookie-parser";\nimport rateLimit from "express-rate-limit";\n',
  expressRoutes: expressRoutes + "\n",
  expressError: '    if (error instanceof AuthError) { response.status(error.status).json({ error: error.message }); return; }',
  files: authenticationFiles
};
