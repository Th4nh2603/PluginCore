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

export const StackSlotDefinitionSchema = z
  .object({
    id: extensionId,
    label: z.string().min(1),
    required: z.boolean().optional(),
    allowNone: z.boolean().optional()
  })
  .strict()
  .superRefine((slot, context) => {
    if (slot.required === true && slot.allowNone === true) {
      context.addIssue({
        code: "custom",
        message: `Stack slot "${slot.id}" cannot be both required and allow None.`
      });
    }
  });

export type StackSlotDefinition = z.infer<typeof StackSlotDefinitionSchema>;

const StackMetadataSchema = z
  .object({
    slots: z.array(StackSlotDefinitionSchema).optional(),
    slot: extensionId.optional(),
    compatibleWith: z.record(extensionId, z.array(extensionId)).optional()
  })
  .strict()
  .superRefine((stack, context) => {
    const ids = stack.slots?.map((slot) => slot.id) ?? [];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Stack slot IDs must be unique." });
    }
  });

export const ExtensionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: extensionId,
    kind: ExtensionKindSchema,
    version: semanticVersion,
    displayName: z.string().min(1),
    description: z.string().min(1).optional(),
    compatibility: z.record(z.string(), z.unknown()).optional(),
    stack: StackMetadataSchema.optional(),
    selection: z
      .object({
        stack: z.record(z.string(), z.string()).default({}),
        capabilities: z.array(extensionId).optional()
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
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.stack?.slots !== undefined && manifest.kind !== "project-type") {
      context.addIssue({ code: "custom", message: "Only project-type manifests may declare stack slots." });
    }
    if ((manifest.stack?.slot !== undefined || manifest.stack?.compatibleWith !== undefined) && manifest.kind !== "stack-component") {
      context.addIssue({ code: "custom", message: "Only stack-component manifests may declare stack component metadata." });
    }
  });

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
