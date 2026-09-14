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

export const ExtensionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: extensionId,
    kind: ExtensionKindSchema,
    version: semanticVersion,
    displayName: z.string().min(1),
    description: z.string().min(1).optional(),
    compatibility: z.record(z.string(), z.unknown()).optional(),
    selection: z
      .object({
        stack: z.record(z.string(), z.string()).default({})
      })
      .optional(),
    dependencies: z.array(extensionId).optional(),
    policyRefs: z.array(extensionId).optional(),
    agentHints: z
      .object({
        required: z.array(extensionId).default([]),
        recommended: z.array(extensionId).default([])
      })
      .optional()
  })
  .strict();

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
