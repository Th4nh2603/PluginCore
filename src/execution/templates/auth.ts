// Shared authentication logic keeps the HTTP adapters independent of the selected ORM.
export const authenticationFiles: Record<string, string> = {
  "src/auth/service.ts": `import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { createUser, findUser } from "../db/users.js";

const scrypt = promisify(scryptCallback);
const credentials = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(12).max(128) });
const secretValue = process.env.JWT_SECRET;
if (!secretValue || secretValue.length < 32) throw new Error("Set JWT_SECRET to at least 32 random characters in .env");
const secret = new TextEncoder().encode(secretValue);
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const publicUser = (user: { id: string; email: string }) => ({ id: user.id, email: user.email });
const parseCredentials = (body: unknown) => {
  const result = credentials.safeParse(body);
  if (!result.success) throw new AuthError(400, "Use a valid email and a password of 12–128 characters");
  return result.data;
};
export const register = async (body: unknown) => {
  const input = parseCredentials(body);
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(input.password, salt, 64) as Buffer;
  try { return publicUser(await createUser(input.email, salt + ":" + hash.toString("hex"))); }
  catch (error) {
    // Prisma and PostgreSQL report unique constraint errors differently.
    if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "23505")) throw new AuthError(409, "Unable to create account");
    if (error instanceof Error && "cause" in error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause && error.cause.code === "23505") throw new AuthError(409, "Unable to create account");
    throw error;
  }
};
export const login = async (body: unknown) => {
  const input = parseCredentials(body);
  const user = await findUser(input.email);
  const [salt, stored] = user?.passwordHash?.split(":") ?? [];
  const hash = await scrypt(input.password, salt ?? "invalid-account-salt", 64) as Buffer;
  const expected = Buffer.from(stored ?? "", "hex");
  if (!user || hash.length !== expected.length || !timingSafeEqual(hash, expected)) throw new AuthError(401, "Invalid email or password");
  const token = await new SignJWT({ email: user.email }).setSubject(user.id).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(secret);
  return { user: publicUser(user), token };
};
export const currentUser = async (token: unknown) => {
  if (typeof token !== "string") throw new AuthError(401, "Unauthorized");
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("Invalid session");
    return { id: payload.sub, email: payload.email };
  } catch { throw new AuthError(401, "Unauthorized"); }
};
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
`
};
