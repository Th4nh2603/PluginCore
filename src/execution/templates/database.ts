export const databaseFiles = (orm: string): Record<string, string> => orm === "drizzle" ? {
  "drizzle.config.ts": `import "dotenv/config";
import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } });
`,
  "src/db/schema.ts": `import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
`,
  "src/db/index.ts": `import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export const closeDatabase = () => pool.end();
`,
  "src/db/users.ts": `import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { users } from "./schema.js";
export const findUser = async (email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
export const createUser = async (email: string, passwordHash: string) => {
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();
  if (!user) throw new Error("Unable to create account");
  return user;
};
`
} : {
  "prisma/schema.prisma": `generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}
model User {
  id String @id @default(uuid())
  email String @unique
  passwordHash String?
  createdAt DateTime @default(now())
}
`,
  "src/db/index.ts": `import { PrismaClient } from "@prisma/client";
export const db = new PrismaClient();
export const closeDatabase = () => db.$disconnect();
`,
  "src/db/users.ts": `import { db } from "./index.js";
export const findUser = (email: string) => db.user.findUnique({ where: { email } });
export const createUser = (email: string, passwordHash: string) => db.user.create({ data: { email, passwordHash } });
`
};
