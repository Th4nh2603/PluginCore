export interface PluginInfo {
  readonly id: string;
  readonly version: string;
}

export const buildInfo = (): PluginInfo => ({
  id: "repo-standard",
  version: "0.1.0"
});
