import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { RepositoryStandardError } from "../../core/errors.js";
import type { GenerationResult } from "../../core/planning/execution-plan.js";
import type { AgentResolution, ResolvedAgent } from "../../core/resolver/agent-resolver.js";
import type { AgentAdapter } from "./agent-adapter.js";

const toml = (value: string): string => JSON.stringify(value);
const tomlArray = (values: readonly string[]): string => `[${values.map(toml).join(", ")}]`;

const roleDetails = (agent: ResolvedAgent, projectType: string) => {
  const definition = agent.manifest.agent;
  if (definition === undefined) throw new RepositoryStandardError("MANIFEST_INVALID", `Agent "${agent.id}" has no rendering metadata.`);
  return {
    definition,
    owns: definition.ownsByProjectType?.[projectType] ?? definition.owns,
    commands: definition.commandsByProjectType?.[projectType] ?? definition.commands
  };
};

const roleFile = (agent: ResolvedAgent, projectType: string): string => {
  const { definition, owns, commands } = roleDetails(agent, projectType);
  return `id = ${toml(agent.id)}\nrole = ${toml(agent.id)}\nversion = ${toml(agent.version)}\ndisplay_name = ${toml(agent.manifest.displayName)}\ndescription = ${toml(agent.manifest.description ?? "")}\nexpertise = ${tomlArray(definition.expertise)}\nintents = ${tomlArray(definition.intents)}\nsignals = ${tomlArray(definition.signals)}\nowns = ${tomlArray(owns)}\ncommands = ${tomlArray(commands)}\nresponsibilities = ${tomlArray(definition.responsibilities)}\nreview_only = ${definition.reviewOnly}\nselection_reason = ${toml(agent.reason)}\ninstructions = ${toml(definition.instructions)}\n`;
};

const roleSummary = (agent: ResolvedAgent, projectType: string): string => {
  const { definition, owns, commands } = roleDetails(agent, projectType);
  return [
    `## ${agent.manifest.displayName} (\`${agent.id}\`)`,
    "",
    agent.manifest.description ?? definition.instructions,
    "",
    `- Role file: \`agents/${agent.id}.toml\``,
    `- Scope: ${owns.length === 0 ? "project-wide advice" : owns.map((owned) => `\`${owned}\``).join(", ")}`,
    `- Instructions: ${definition.instructions}`,
    ...(definition.responsibilities.length === 0 ? [] : ["- Tasks:", ...definition.responsibilities.map((task) => `  - ${task}`)]),
    ...(commands.length === 0 ? [] : [`- Verify: ${commands.map((command) => `\`${command}\``).join(", ")}`]),
    ...(definition.reviewOnly ? ["- Review only: do not edit source files."] : [])
  ].join("\n");
};

export const renderCodexAgents = async (targetDirectory: string, resolution: AgentResolution): Promise<GenerationResult> => {
  if (resolution.enabled.length === 0) return { files: [] };

  const files = resolution.enabled.map((agent) => {
    if (!/^[a-z0-9-]+$/u.test(agent.id)) throw new RepositoryStandardError("MANIFEST_INVALID", `Agent ID "${agent.id}" cannot be used as a role filename.`);
    return { relative: `agents/${agent.id}.toml`, content: roleFile(agent, resolution.projectType) };
  });
  const index = [
    "# Agent roles",
    "",
    `Project type: ${resolution.projectType}. Read \`repo.config.yaml\` and \`README.md\` for the actual stack and setup commands.`,
    "These roles are working instructions; creating the repository does not start agents. Follow the matching role guidance for each affected area.",
    "",
    ...resolution.enabled.map((agent) => roleSummary(agent, resolution.projectType)).flatMap((summary) => [summary, ""])
  ].join("\n");
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
