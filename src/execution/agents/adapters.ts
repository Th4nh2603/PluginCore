import { RepositoryStandardError } from "../../core/errors.js";
import type { AgentAdapter } from "./agent-adapter.js";
import { codexAgentAdapter } from "./codex-agent-adapter.js";

const adapters: Readonly<Record<string, AgentAdapter>> = {
  [codexAgentAdapter.id]: codexAgentAdapter
};

export const selectAgentAdapter = (id: string): AgentAdapter => {
  const adapter = adapters[id];
  if (adapter === undefined) throw new RepositoryStandardError("CONFIG_INVALID", `No agent adapter executor is available for "${id}".`);
  return adapter;
};
