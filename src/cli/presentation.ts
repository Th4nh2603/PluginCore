import type { PluginInfo } from "../application/info-service.js";

export interface PresetPreview {
  readonly displayName: string;
  readonly selection?: { readonly stack: Readonly<Record<string, string>> } | undefined;
}

const paint = (value: string, code: number, enabled: boolean): string => enabled ? `\u001B[${code}m${value}\u001B[0m` : value;

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
  repo create <name>`;

export const infoText = (info: PluginInfo): string => `${info.id} ${info.version}`;
