import type { BackendAuthentication } from "../templates/backend.js";

const fastifyRoutes = `  await app.register(clerkPlugin);
  app.get("/auth/me", async (request, reply) => {
    const { isAuthenticated, userId } = getAuth(request);
    if (!isAuthenticated || !userId) return reply.code(401).send({ error: "Unauthorized" });
    return { userId };
  });`;
const expressRoutes = `  app.use(clerkMiddleware());
  app.get("/auth/me", (request, response) => {
    const { isAuthenticated, userId } = getAuth(request);
    if (!isAuthenticated || !userId) { response.status(401).json({ error: "Unauthorized" }); return; }
    response.json({ userId });
  });`;

export const clerkBackendAuthentication: BackendAuthentication = {
  dependencies: (fastify) => fastify ? { "@clerk/fastify": "^3.1.79" } : { "@clerk/express": "^2.1.69" },
  devDependencies: () => ({}),
  imports: "",
  fastifyImports: '\nimport { clerkPlugin, getAuth } from "@clerk/fastify";',
  fastifyRoutes: "\n" + fastifyRoutes,
  expressImports: '\nimport { clerkMiddleware, getAuth } from "@clerk/express";',
  expressRoutes: "\n" + expressRoutes,
  expressError: "",
  files: {}
};
