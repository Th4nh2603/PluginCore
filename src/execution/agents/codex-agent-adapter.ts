import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { RepositoryStandardError } from "../../core/errors.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";
import type { AgentResolution, ResolvedAgent } from "../../core/resolver/agent-resolver.js";
import type { AgentAdapter } from "./agent-adapter.js";

const toml = (value: string): string => JSON.stringify(value);
const tomlArray = (values: readonly string[]): string => `[${values.map(toml).join(", ")}]`;

const roleFile = (agent: ResolvedAgent, projectType: string): string => {
  const definition = agent.manifest.agent;
  if (definition === undefined) throw new RepositoryStandardError("MANIFEST_INVALID", `Agent "${agent.id}" has no rendering metadata.`);
  const owns = definition.ownsByProjectType?.[projectType] ?? definition.owns;
  const commands = definition.commandsByProjectType?.[projectType] ?? definition.commands;
  return `id = ${toml(agent.id)}\nrole = ${toml(agent.id)}\nowns = ${tomlArray(owns)}\ncommands = ${tomlArray(commands)}\nreview_only = ${definition.reviewOnly}\ninstructions = ${toml(definition.instructions)}\n`;
};

export const renderCodexAgents = async (targetDirectory: string, resolution: AgentResolution): Promise<GenerationResult> => {
  if (resolution.enabled.length === 0) return { files: [] };

  const files = resolution.enabled.map((agent) => {
    if (!/^[a-z0-9-]+$/u.test(agent.id)) throw new RepositoryStandardError("MANIFEST_INVALID", `Agent ID "${agent.id}" cannot be used as a role filename.`);
    return { relative: `agents/${agent.id}.toml`, content: roleFile(agent, resolution.projectType) };
  });
  const index = "# Agent roles\n\nRead the matching role file before changing its workspace. Roles marked review_only are advisory.\n\n" +
    files.map(({ relative }) => `- \`${relative}\``).join("\n") + "\n";
  files.unshift({ relative: "AGENTS.md", content: index });

  for (const { relative, content } of files) {
    const file = path.join(targetDirectory, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  return {
    files: files.map(({ relative }) => relative),
    ownership: [
      { path: "AGENTS.md", owner: "adapter:codex" },
      ...resolution.enabled.map((agent) => ({ path: `agents/${agent.id}.toml`, owner: `agent:${agent.id}`, version: agent.version }))
    ]
  };
};

export const codexAgentAdapter: AgentAdapter = { id: "codex", render: renderCodexAgents };
