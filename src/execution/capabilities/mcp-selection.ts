import type { RepoConfig } from "../../core/config/repo-config.js";

export const hasMcpCapability = (config: RepoConfig): boolean =>
  config.composition.capabilities?.some(({ id }) => id === "mcp-server") ?? false;
