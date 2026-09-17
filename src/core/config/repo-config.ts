import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { z } from "zod";

import { RepositoryStandardError } from "../errors.js";
import { resolveProjectPath } from "../security/project-path.js";

const extensionReference = z
  .string()
  .regex(/^[a-z0-9][a-z0-9./-]*@[0-9][a-z0-9.-]*$/i, "Expected an extension reference such as example@1.");

const capabilityReference = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  configRef: z.string().min(1).optional()
});

const providerId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid provider ID.");

export const RepoConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    plugin: z.object({
      id: z.literal("repo-standard"),
      version: z.string().min(1)
    }),
    project: z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      root: z.string().min(1)
    }),
    composition: z.object({
      preset: extensionReference.optional(),
      stack: z.record(z.string(), extensionReference),
      authentication: providerId.optional(),
      capabilities: z.array(capabilityReference).optional()
    }),
    agents: z.object({
      mode: z.enum(["automatic", "recommended", "custom", "none"]),
      enabled: z.array(z.string()),
      adapters: z.array(z.string())
    }),
    flows: z.object({
      defaults: z.array(z.string())
    }),
    integrations: z
      .object({
        git: extensionReference.optional(),
        ci: extensionReference.optional()
      })
      .optional(),
    standards: z.object({
      overrides: z.array(z.string())
    }),
    managed: z.object({
      stateFile: z.string().min(1)
    })
  })
  .strict();

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

const secretLikeKey = /password|secret|token|api[-_]?key/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSecretReference = (value: unknown): boolean => {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    ((keys[0] === "env" && typeof value.env === "string") ||
      (keys[0] === "secretRef" && typeof value.secretRef === "string"))
  );
};

const findPlaintextSecret = (value: unknown, location = "$"): string | undefined => {
  if (Array.isArray(value)) {
    return value.map((item, index) => findPlaintextSecret(item, `${location}[${index}]`)).find(Boolean);
  }

  if (!isRecord(value)) return undefined;

  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;

    if (secretLikeKey.test(key) && !isSecretReference(child)) {
      return childLocation;
    }

    const nestedSecret = findPlaintextSecret(child, childLocation);
    if (nestedSecret !== undefined) return nestedSecret;
  }

  return undefined;
};

export const parseRepoConfig = (text: string): RepoConfig => {
  try {
    const parsed: unknown = parse(text);
    const secretLocation = findPlaintextSecret(parsed);

    if (secretLocation !== undefined) {
      throw new RepositoryStandardError(
        "CONFIG_INVALID",
        `Plaintext secret-like value found at ${secretLocation}. Use an env or secretRef object instead.`
      );
    }

    return RepoConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof RepositoryStandardError) throw error;

    throw new RepositoryStandardError("CONFIG_INVALID", "Invalid repo.config.yaml.", { cause: error });
  }
};

export const loadRepoConfig = async (projectRoot: string): Promise<RepoConfig> => {
  const configPath = resolveProjectPath(projectRoot, "repo.config.yaml");

  try {
    return parseRepoConfig(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error instanceof RepositoryStandardError) throw error;

    throw new RepositoryStandardError("CONFIG_INVALID", `Unable to read ${configPath}.`, { cause: error });
  }
};
