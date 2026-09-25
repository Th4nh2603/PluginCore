import type { AgentResolution } from "../../core/resolver/agent-resolver.js";

export interface AgentAdapter {
  readonly id: string;
  render(targetDirectory: string, resolution: AgentResolution): Promise<readonly string[]>;
}
