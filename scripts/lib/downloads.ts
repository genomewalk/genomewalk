import type { ResolvedOptions } from "./types.ts";
import { BUILDS, SOURCES } from "./config.ts";
import { download } from "./util.ts";
import fs from "node:fs";
import { extractCitations } from "./reference/clinvar-citations.ts";
import { log } from "./log.ts";

export async function downloadCitations({ paths, fresh = false }: ResolvedOptions) {
  if (!fresh && fs.existsSync(paths.citations)) {
    log(`Have ${paths.citations} — reuse (use --fresh to download again)`);
    return;
  }
  await download(SOURCES.citations, paths.citationXml, { fresh, timeoutMs: 3_600_000 });
  await extractCitations(paths.citationXml, paths.citations);
}
export async function downloadInputs(options: ResolvedOptions) {
  for (const build of new Set(["GRCh38", ...(options.only ? [options.only] : BUILDS)]))
    await download(SOURCES.clinvar(build), options.paths.clinvar(build), { fresh: options.fresh });
  await downloadCitations(options);
}
