import type { AgentResolution } from "../../core/resolver/agent-resolver.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";

export interface AgentAdapter {
  readonly id: string;
  render(targetDirectory: string, resolution: AgentResolution): Promise<GenerationResult>;
}
