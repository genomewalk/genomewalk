import type { paths } from "./config.ts";
/** CLI values remain strings until the owning stage validates and converts them. */
export interface BuildOptions {
  "data-dir"?: string | undefined;
  "out-dir"?: string | undefined;
  build?: string | undefined;
  only?: string | undefined;
  fresh?: boolean | undefined;
  offline?: boolean | undefined;
  "dry-run"?: boolean | undefined;
  "join-only"?: boolean | undefined;
  check?: boolean | undefined;
  help?: boolean | undefined;
  jobs?: string | undefined;
  chrom?: string | undefined;
  paths?: ReturnType<typeof paths>;
}
export type ResolvedOptions = BuildOptions & { paths: ReturnType<typeof paths> };
