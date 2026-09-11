export type ParsedCommand =
  | { readonly kind: "help" }
  | { readonly kind: "info" }
  | { readonly kind: "unknown"; readonly value?: string };

export const parseArguments = (argv: readonly string[]): ParsedCommand => {
  const command = argv[0];

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    return { kind: "help" };
  }

  if (command === "info") return { kind: "info" };

  return { kind: "unknown", value: command };
};
