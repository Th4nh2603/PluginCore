import type { PluginInfo } from "../application/info-service.js";

export interface PresetPreview {
  readonly displayName: string;
  readonly selection?: { readonly stack: Readonly<Record<string, string>> } | undefined;
}

const paint = (value: string, code: number, enabled: boolean): string => enabled ? `\u001B[${code}m${value}\u001B[0m` : value;

const projectTypeAccent: Readonly<Record<string, number>> = {
  web: 34,
  api: 32,
  cli: 33,
  library: 35,
  monorepo: 208,
  empty: 90
};

export interface SelectOption {
  readonly name: string;
  readonly value: string;
}

export const formatSelectOption = (index: number, option: SelectOption, color: boolean): string => {
  const accent = projectTypeAccent[option.value] ?? 36;
  const accentCode = accent === 208 ? "38;5;208" : String(accent);
  return `${paint(`${index}.`, 33, color)} ${color ? `\u001B[${accentCode}m${option.name}\u001B[0m` : option.name}`;
};

export const formatPresetPreview = (preset: PresetPreview, color: boolean): string => [
  paint(preset.displayName, 1, color),
  ...Object.entries(preset.selection?.stack ?? {}).map(([category, value]) =>
    `${paint(`${category.charAt(0).toUpperCase()}${category.slice(1)}:`, 36, color)} ${paint(value, 32, color)}`
  )
].join("\n");

export const helpText = (): string => `Repository Standard Plugin

Usage:
  repo --help
  repo info
  repo doctor
  repo create <name> [--auth custom|clerk]`;

export const infoText = (info: PluginInfo): string => `${info.id} ${info.version}`;
