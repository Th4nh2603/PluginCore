import type { ExtensionManifest } from "../core/registry/manifest.js";
import type { Registry } from "../core/registry/registry-loader.js";
import type { CliPrompt } from "./main.js";
import type { SelectOption } from "./presentation.js";

const categories = [
  { key: "frontend", label: "Frontend", stackKey: "frontend-library", preferred: "react" },
  { key: "backend", label: "Backend", stackKey: "backend-framework", preferred: "express" },
  { key: "orm", label: "ORM", stackKey: "orm", preferred: "prisma" }
] as const;

type CategoryKey = (typeof categories)[number]["key"];
type Values = Record<CategoryKey | "auth", string>;

export interface MonorepoSelection {
  readonly preset?: string;
  readonly stack: Readonly<Record<string, string>>;
  readonly authentication: string;
  readonly startingPoint: string;
  readonly changed: boolean;
}

export interface MonorepoEditorInput {
  readonly preset?: string;
  readonly authentication?: string;
  readonly previous?: MonorepoSelection;
}

const compatible = (manifest: ExtensionManifest): boolean => {
  const types = manifest.compatibility?.projectTypes;
  return !Array.isArray(types) || types.includes("monorepo");
};

const referenceId = (reference: string): string => reference.split("@")[0] ?? reference;

const equivalentReference = (left: string, right: string): boolean => {
  const [leftId, leftVersion = ""] = left.split("@");
  const [rightId, rightVersion = ""] = right.split("@");
  const normalized = (version: string): string => version.split(".").concat(["0", "0"]).slice(0, 3).join(".");
  return leftId === rightId && normalized(leftVersion) === normalized(rightVersion);
};

const orderedComponents = (registry: Registry, category: CategoryKey, preferred: string): readonly ExtensionManifest[] =>
  registry.list("stack-component")
    .filter((item) => item.category === category && compatible(item))
    .sort((left, right) => Number(right.id === preferred) - Number(left.id === preferred) || left.id.localeCompare(right.id));

const preferredAuth = (preset: ExtensionManifest | undefined): string =>
  preset?.selection?.capabilities?.find((id) => id.startsWith("auth-"))?.replace(/^auth-/u, "") ?? "";

const displayValue = (registry: Registry, category: CategoryKey | "auth", value: string): string => {
  if (value === "") return "Not selected";
  if (category === "auth") return registry.get("capability", `auth-${value}`)?.displayName ?? value;
  return registry.get("stack-component", referenceId(value))?.displayName ?? value;
};

export const runMonorepoEditor = async (
  registry: Registry,
  prompt: CliPrompt,
  input: MonorepoEditorInput
): Promise<MonorepoSelection | undefined> => {
  const presets = registry.list("preset").filter(compatible);
  const recommended = presets.find((preset) => preset.id === "recommended-monorepo") ?? presets[0];
  let preset = input.previous?.preset === undefined
    ? input.preset === undefined ? undefined : registry.get("preset", input.preset)
    : registry.get("preset", input.previous.preset);
  if (input.preset !== undefined && (preset === undefined || !compatible(preset))) return undefined;

  let startingPoint = input.previous?.startingPoint ?? "Custom";
  if (input.previous === undefined && input.preset === undefined) {
    const choices: SelectOption[] = [
      ...(recommended === undefined ? [] : [{ name: "Recommended Monorepo", value: "recommended", tone: "recommended" as const }]),
      { name: "Custom", value: "custom", tone: "custom" }
    ];
    const answer = await prompt.select("Start from", choices);
    if (!choices.some((choice) => choice.value === answer)) return undefined;
    preset = answer === "recommended" ? recommended : undefined;
    startingPoint = preset === undefined ? "Custom" : "Recommended Monorepo";
  } else if (input.previous === undefined && preset !== undefined) {
    startingPoint = preset.displayName.split(" — ")[0] ?? preset.displayName;
  }

  const options = Object.fromEntries(categories.map((category) => [category.key, orderedComponents(registry, category.key, category.preferred)])) as Record<CategoryKey, readonly ExtensionManifest[]>;
  const authOptions = registry.list("capability")
    .filter((item) => item.id.startsWith("auth-") && compatible(item))
    .sort((left, right) => Number(right.id === "auth-custom") - Number(left.id === "auth-custom") || left.id.localeCompare(right.id));
  if (categories.some((category) => options[category.key].length === 0) || (input.authentication === undefined && authOptions.length === 0)) return undefined;
  if (input.authentication !== undefined && !authOptions.some((item) => item.id === `auth-${input.authentication}`)) return undefined;

  const values: Values = {
    frontend: preset?.selection?.stack["frontend-library"] ?? "",
    backend: preset?.selection?.stack["backend-framework"] ?? "",
    orm: preset?.selection?.stack.orm ?? "",
    auth: input.authentication ?? preferredAuth(preset)
  };
  if (input.previous !== undefined) {
    for (const category of categories) values[category.key] = input.previous.stack[category.stackKey] ?? values[category.key];
    values.auth = input.authentication ?? input.previous.authentication;
  }

  for (const category of categories) {
    const value = values[category.key];
    if (value !== "" && !options[category.key].some((item) => equivalentReference(value, `${item.id}@${item.version}`))) {
      values[category.key] = "";
    }
  }
  if (values.auth !== "" && !authOptions.some((item) => item.id === `auth-${values.auth}`)) values.auth = "";

  for (const category of categories) {
    const available = options[category.key];
    if (available.length === 1 && values[category.key] === "") {
      const only = available[0];
      if (only !== undefined) values[category.key] = `${only.id}@${only.version}`;
    }
  }
  if (authOptions.length === 1 && values.auth === "") values.auth = authOptions[0]?.id.replace(/^auth-/u, "") ?? "";

  for (;;) {
    const rows: SelectOption[] = [
      ...categories.map((category) => ({
        name: `${category.label}: ${displayValue(registry, category.key, values[category.key])}`,
        value: `edit:${category.key}`
      })),
      ...(input.authentication === undefined
        ? [{ name: `Authentication: ${displayValue(registry, "auth", values.auth)}`, value: "edit:auth" }]
        : []),
      {
        name: `Continue — ${input.authentication === undefined ? "" : `Authentication: ${displayValue(registry, "auth", values.auth)} (fixed) · `}fixed: Vite · TypeScript · pnpm workspace · PostgreSQL · Vitest`,
        value: "continue",
        tone: "success"
      }
    ];
    let action = await prompt.select("Configure stack", rows);
    if (!rows.some((row) => row.value === action)) return undefined;
    if (action === "continue") {
      const missing = ([...categories.map((category) => category.key), "auth"] as const).find((key) => values[key] === "");
      if (missing !== undefined) action = `edit:${missing}`;
    }
    if (action === "continue") {
      const stack: Record<string, string> = {};
      for (const category of categories) {
        const chosen = values[category.key];
        const initial = preset?.selection?.stack[category.stackKey];
        if (initial === undefined || !equivalentReference(chosen, initial)) stack[category.stackKey] = chosen;
      }
      const changed = preset !== undefined && (
        Object.keys(stack).length > 0 || values.auth !== preferredAuth(preset)
      );
      return {
        ...(preset === undefined ? {} : { preset: preset.id }),
        stack,
        authentication: values.auth,
        startingPoint,
        changed
      };
    }
    if (action === "edit:auth") {
      if (input.authentication !== undefined) continue;
      if (authOptions.length === 1) {
        values.auth = authOptions[0]?.id.replace(/^auth-/u, "") ?? "";
        continue;
      }
      const choices = authOptions.map((item) => ({ name: item.displayName, value: item.id.replace(/^auth-/u, "") }));
      const selected = await prompt.select("Authentication", choices);
      if (!choices.some((choice) => choice.value === selected)) return undefined;
      values.auth = selected;
      continue;
    }
    const category = categories.find((item) => action === `edit:${item.key}`);
    if (category === undefined) return undefined;
    const available = options[category.key];
    if (available.length === 1) {
      const only = available[0];
      if (only !== undefined) values[category.key] = `${only.id}@${only.version}`;
      continue;
    }
    const choices = available.map((item) => ({ name: item.displayName, value: item.id }));
    const selected = await prompt.select(category.label, choices);
    const item = available.find((candidate) => candidate.id === selected);
    if (item === undefined) return undefined;
    values[category.key] = `${item.id}@${item.version}`;
  }
};
