import { z } from "zod";

export const ExtensionKinds = [
  "project-type",
  "stack-component",
  "preset",
  "capability",
  "agent",
  "flow",
  "integration",
  "adapter"
] as const;

export const ExtensionKindSchema = z.enum(ExtensionKinds);
export type ExtensionKind = z.infer<typeof ExtensionKindSchema>;

const extensionId = z.string().regex(/^[a-z0-9][a-z0-9./-]*$/i, "Invalid extension ID.");
const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Invalid SemVer.");

const FlowSchema = z.object({
  intents: z.array(z.string().min(1)).min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    inputs: z.array(z.string().min(1)),
    outcome: z.string().min(1),
    expertise: z.array(z.string().min(1)),
    gates: z.array(z.enum(["verification", "review"])).default([]),
    condition: z.enum(["policy.requiresReview"]).optional()
  }).strict()).min(1)
}).strict();

export const ExtensionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: extensionId,
    kind: ExtensionKindSchema,
    version: semanticVersion,
    displayName: z.string().min(1),
    description: z.string().min(1).optional(),
    category: z.enum(["frontend", "backend", "orm"]).optional(),
    compatibility: z.record(z.string(), z.unknown()).optional(),
    selection: z
      .object({
        stack: z.record(z.string(), z.string()).default({}),
        capabilities: z.array(extensionId).optional(),
        adapters: z.array(extensionId).optional()
      })
      .optional(),
    dependencies: z.array(extensionId).optional(),
    policyRefs: z.array(extensionId).optional(),
    agentHints: z
      .object({
        required: z.array(extensionId).default([]),
        recommended: z.array(extensionId).default([])
      })
      .optional(),
    flow: FlowSchema.optional(),
    agent: z.object({
      expertise: z.array(z.string()).default([]),
      intents: z.array(z.string()).default([]),
      signals: z.array(z.string()).default([]),
      owns: z.array(z.string()).default([]),
      commands: z.array(z.string()).default([]),
      ownsByProjectType: z.record(z.string(), z.array(z.string())).optional(),
      commandsByProjectType: z.record(z.string(), z.array(z.string())).optional(),
      instructions: z.string().min(1),
      reviewOnly: z.boolean().default(false),
      requiredOnSignal: z.boolean().default(false)
    }).strict().optional()
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.kind === "flow" && manifest.flow === undefined) {
      context.addIssue({ code: "custom", message: "Flow manifest requires a flow definition.", path: ["flow"] });
    }
    if (manifest.kind !== "flow" && manifest.flow !== undefined) {
      context.addIssue({ code: "custom", message: "Only flow manifests can define a flow.", path: ["flow"] });
    }
  });

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
