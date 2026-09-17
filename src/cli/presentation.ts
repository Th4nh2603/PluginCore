import type { PluginInfo } from "../application/info-service.js";

export interface PresetPreview {
  readonly displayName: string;
  readonly selection?: { readonly stack: Readonly<Record<string, string>> } | undefined;
  readonly extraRows?: readonly PreviewRow[] | undefined;
}

export interface PreviewRow {
  readonly label: string;
  readonly value: string;
}

export type SelectTone = "default" | "recommended" | "custom" | "success";

export interface SelectOption {
  readonly name: string;
  readonly value: string;
  readonly tone?: SelectTone;
}

const paint = (value: string, code: string | number, enabled: boolean): string => enabled ? `\u001B[${code}m${value}\u001B[0m` : value;

const titleCase = (value: string): string => value
  .split(/[-_\s]+/u)
  .filter(Boolean)
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(" ");

const previewCategory = (category: string): string => {
  if (category === "workspace") return "Workspace";
  if (category.startsWith("frontend-")) return "Frontend";
  if (category.startsWith("backend-")) return "Backend";
  if (category === "language" || category.endsWith("-language")) return "Language";
  if (category === "testing") return "Testing";
  return titleCase(category.replace(/-(framework|library)$/u, ""));
};

const compactRecommendedTitle = (displayName: string): string => displayName
  .split(" — ")[0]
  ?.replace(/\s+Stack$/u, "") ?? displayName;

const stackRows = (stack: Readonly<Record<string, string>>): readonly PreviewRow[] => {
  const rows = new Map<string, string[]>();

  for (const [category, value] of Object.entries(stack)) {
    const label = previewCategory(category);
    const values = rows.get(label) ?? [];
    values.push(value);
    rows.set(label, values);
  }

  return [...rows.entries()].map(([label, values]) => ({ label, value: values.join(" + ") }));
};

export const conciseProjectTypeName = (displayName: string): string => (displayName.split(" — ")[0] ?? displayName)
  .replace(/\s+Application$/u, "");

export const formatPrompt = (message: string, color: boolean): string => `${paint("?", 36, color)} ${paint(message, 1, color)}`;

export const formatSelectOption = (index: number, option: SelectOption, color: boolean): string => {
  const prefix = paint(`${index}.`, 90, color);

  if (option.tone === "recommended") {
    const name = option.name.replace(/^★\s*/u, "");
    return `${prefix} ${paint("★", 33, color)} ${paint(name, 92, color)}`;
  }

  if (option.tone === "custom") return `${prefix} ${paint(option.name, 33, color)}`;
  if (option.tone === "success") return `${prefix} ${paint(option.name, 92, color)}`;
  return `${prefix} ${paint(option.name, 97, color)}`;
};

export const formatPreviewRow = (row: PreviewRow, color: boolean): string =>
  `  ${paint(row.label.padEnd(16), 90, color)} ${paint(row.value, 97, color)}`;

export const formatPresetPreview = (preset: PresetPreview, color: boolean): string => {
  const rows = [
    ...stackRows(preset.selection?.stack ?? {}),
    ...(preset.extraRows ?? [])
  ];

  return [
    paint(compactRecommendedTitle(preset.displayName), "1;36", color),
    paint("────────────────────────────────────", 90, color),
    ...rows.map((row) => color
      ? formatPreviewRow(row, true)
      : `${row.label}: ${row.value}`),
    paint("────────────────────────────────────", 90, color)
  ].join("\n");
};

export const helpText = (): string => `Repository Standard Plugin

Usage:
  repo --help
  repo info
  repo doctor
  repo create <name> [--auth <provider>]`;

export const infoText = (info: PluginInfo): string => `${info.id} ${info.version}`;
