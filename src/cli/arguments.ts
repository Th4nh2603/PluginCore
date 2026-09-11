export type ParsedCommand =
  | { readonly kind: "help" }
  | { readonly kind: "info" }
  | { readonly kind: "doctor" }
  | { readonly kind: "create"; readonly name?: string; readonly options: ReadonlyMap<string, string | true> }
  | { readonly kind: "unknown"; readonly value?: string };

export const parseArguments = (argv: readonly string[]): ParsedCommand => {
  const command = argv[0];

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    return { kind: "help" };
  }

  if (command === "info") return { kind: "info" };
  if (command === "doctor") return { kind: "doctor" };
  if (command === "create") {
    const options = new Map<string, string | true>();
    for (let index = 2; index < argv.length; index += 1) {
      const token = argv[index];
      if (token?.startsWith("--")) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) options.set(token, true);
        else { options.set(token, value); index += 1; }
      }
    }
    return argv[1] === undefined
      ? { kind: "create", options }
      : { kind: "create", name: argv[1], options };
  }

  return { kind: "unknown", value: command };
};
