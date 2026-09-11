import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { RepositoryStandardError } from "../errors.js";
import { resolveProjectPath } from "../security/project-path.js";
import { ExtensionManifestSchema } from "./manifest.js";
import type { ExtensionKind, ExtensionManifest } from "./manifest.js";

const registryKey = (kind: ExtensionKind, id: string): string => `${kind}:${id}`;

export class Registry {
  readonly #entries: ReadonlyMap<string, ExtensionManifest>;

  public constructor(entries: Iterable<ExtensionManifest>) {
    this.#entries = new Map([...entries].map((entry) => [registryKey(entry.kind, entry.id), entry]));
  }

  public get(kind: ExtensionKind, id: string): ExtensionManifest | undefined {
    return this.#entries.get(registryKey(kind, id));
  }

  public list(kind: ExtensionKind): readonly ExtensionManifest[] {
    return [...this.#entries.values()].filter((entry) => entry.kind === kind);
  }
}

const findManifestPaths = async (registryRoot: string, directory = registryRoot): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) continue;

    const candidate = resolveProjectPath(registryRoot, path.relative(registryRoot, path.join(directory, entry.name)));

    if (entry.isDirectory()) {
      paths.push(...(await findManifestPaths(registryRoot, candidate)));
    } else if (entry.isFile() && entry.name === "manifest.yaml") {
      paths.push(candidate);
    }
  }

  return paths;
};

const loadManifest = async (manifestPath: string): Promise<ExtensionManifest> => {
  try {
    const parsed: unknown = parse(await readFile(manifestPath, "utf8"));
    const result = ExtensionManifestSchema.safeParse(parsed);

    if (!result.success) {
      throw new RepositoryStandardError("MANIFEST_INVALID", `Invalid manifest at ${manifestPath}.`, {
        diagnosticData: { issues: result.error.issues }
      });
    }

    return result.data;
  } catch (error) {
    if (error instanceof RepositoryStandardError) throw error;

    throw new RepositoryStandardError("MANIFEST_INVALID", `Unable to load manifest at ${manifestPath}.`, {
      cause: error
    });
  }
};

export const loadRegistry = async (registryRoot: string): Promise<Registry> => {
  const resolvedRoot = resolveProjectPath(registryRoot, ".");
  const manifests = await Promise.all((await findManifestPaths(resolvedRoot)).map(loadManifest));
  const entries = new Map<string, ExtensionManifest>();

  for (const manifest of manifests) {
    const key = registryKey(manifest.kind, manifest.id);

    if (entries.has(key)) {
      throw new RepositoryStandardError("REGISTRY_CONFLICT", `Duplicate registry extension ${key}.`, {
        diagnosticData: { key }
      });
    }

    entries.set(key, manifest);
  }

  return new Registry(entries.values());
};
