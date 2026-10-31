import type { ParseArgsConfig } from "node:util";
import type { ResolvedOptions } from "./types.ts";
type OptionSchema = NonNullable<ParseArgsConfig["options"]>;
import { parseArgs } from "node:util";
import { BUILDS, paths } from "./config.ts";

export const boolean = { type: "boolean" } as const;
export const string = { type: "string" } as const;
const common = { help: boolean, "data-dir": string, "out-dir": string };

export function parseOptions(schema: OptionSchema, args = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    options: { ...common, ...schema },
    strict: true,
    allowPositionals: false,
  });
  const values = parsed.values as Omit<ResolvedOptions, "paths">;
  for (const key of ["build", "only"] as const)
    if (values[key] && !BUILDS.includes(values[key]))
      throw new Error(`--${key} must be GRCh38 or GRCh37`);
  if (values.chrom && !/^(?:[1-9]|1[0-9]|2[0-2]|X|Y)$/.test(values.chrom))
    throw new Error("--chrom must be 1–22, X or Y");
  if (values.jobs && (!/^\d+$/.test(values.jobs) || +values.jobs < 1 || +values.jobs > 16))
    throw new Error("--jobs must be an integer from 1 to 16");
  if (values.offline && values.fresh) throw new Error("--offline and --fresh cannot be combined");
  return { ...values, paths: paths(values) };
}

const optionHelp: Record<string, string> = {
  help: "Show usage without running the command",
  "data-dir": "Downloaded input and intermediate cache (default: data/)",
  "out-dir": "Generated public assets (default: public/ref/)",
  only: "Limit outputs to GRCh37 or GRCh38 (default: both)",
  build: "Reference build: GRCh37 or GRCh38",
  fresh: "Refresh upstream inputs instead of reusing cache",
  offline: "Use cached inputs only; fail instead of making a network request",
  "dry-run": "Print ordered stages without requests or writes",
  "join-only": "Create only the GRCh38 allele-ID join needed by GRCh37",
  chrom: "Extract one chromosome to a separate partial cache: 1–22, X or Y",
  jobs: "Concurrent frequency extractions, 1–16 (default: 3)",
  check: "Validate existing consumer indexes without writing",
};

export async function runCli(
  description: string,
  schema: OptionSchema,
  action: (options: ResolvedOptions) => unknown,
) {
  try {
    const options = parseOptions(schema);
    if (options.help) {
      console.log(description + "\n\nOptions:");
      for (const [name, spec] of Object.entries({ ...schema, ...common } as OptionSchema))
        console.log(
          `  ${`--${name}${spec.type === "string" ? " <value>" : ""}`.padEnd(23)} ${optionHelp[name] || ""}${spec.default ? ` (default: ${spec.default})` : ""}`,
        );
      return;
    }
    await action(options);
  } catch (error) {
    console.error(
      `Reference build failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
