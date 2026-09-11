import type { PluginInfo } from "../application/info-service.js";

export const helpText = (): string => `Repository Standard Plugin

Usage:
  repo --help
  repo info
  repo doctor
  repo create <name>`;

export const infoText = (info: PluginInfo): string => `${info.id} ${info.version}`;
