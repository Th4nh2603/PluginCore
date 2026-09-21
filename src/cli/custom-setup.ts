import type { Registry } from "../core/registry/registry-loader.js";
import type { CliPrompt } from "./main.js";

export const selectCustomStack = async (registry: Registry, projectType: string, prompt: CliPrompt): Promise<Record<string, string> | undefined> => {
  const stack: Record<string, string> = {};
  for (const [category, label] of [["frontend", "Frontend"], ["backend", "Backend"], ["orm", "ORM"]] as const) {
    const components = registry.list("stack-component").filter((item) => {
      const types = item.compatibility?.projectTypes;
      return item.category === category && Array.isArray(types) && types.includes(projectType);
    }).sort((a, b) => {
      const preferred = { frontend: "react", backend: "express", orm: "prisma" }[category];
      return Number(b.id === preferred) - Number(a.id === preferred) || a.id.localeCompare(b.id);
    });
    if (components.length === 0) continue;
    const selected = await prompt.select(label, components.map((item) => ({ name: item.displayName, value: item.id })));
    const component = components.find((item) => item.id === selected);
    if (component === undefined) return undefined;
    stack[category] = `${component.id}@${component.version}`;
  }
  return stack;
};
