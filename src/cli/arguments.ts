export type ParsedCommand =
  | { readonly kind: "help" }
  | { readonly kind: "info" }
  | { readonly kind: "doctor" }
  | { readonly kind: "agents"; readonly action?: string; readonly options: ReadonlyMap<string, string | true> }
  | { readonly kind: "create"; readonly name?: string; readonly options: ReadonlyMap<string, string | true> }
  | { readonly kind: "unknown"; readonly value?: string };

export const parseArguments = (argv: readonly string[]): ParsedCommand => {
  const command = argv[0];

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    return { kind: "help" };
  }

  if (command === "info") return { kind: "info" };
  if (command === "doctor") return { kind: "doctor" };
  if (command === "agents") {
    const action = argv[1]?.startsWith("--") ? undefined : argv[1];
    const options = new Map<string, string | true>();
    for (let index = action === undefined ? 1 : 2; index < argv.length; index += 1) {
      const token = argv[index];
      if (token?.startsWith("--")) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) options.set(token, true);
        else { options.set(token, value); index += 1; }
      }
    }
    return { kind: "agents", ...(action === undefined ? {} : { action }), options };
  }
  if (command === "create") {
    const options = new Map<string, string | true>();
    const name = argv[1]?.startsWith("--") ? undefined : argv[1];
    for (let index = name === undefined ? 1 : 2; index < argv.length; index += 1) {
      const token = argv[index];
      if (token?.startsWith("--")) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) options.set(token, true);
        else { options.set(token, value); index += 1; }
      }
    }
    return name === undefined
      ? { kind: "create", options }
      : { kind: "create", name, options };
  }

  return { kind: "unknown", value: command };
};
