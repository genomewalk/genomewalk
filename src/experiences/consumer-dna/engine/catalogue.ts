import type { Status } from "../../../lib/io/types.ts";
import { loadRangeCatalogue } from "../../../lib/catalogues/catalogue-ranges.ts";
import { loadLookup } from "../lookup/index.ts";
import { ctx } from "./context.ts";

export async function loadCatalog(signal?: AbortSignal, onStatus?: Status) {
  signal?.throwIfAborted();
  const build = ctx.build || "GRCh38";
  if (ctx.catalog && ctx.catalog.build === build) return ctx.catalog;
  const base = await loadRangeCatalogue(build, signal, onStatus);
  onStatus?.("Checking marker identifiers…");
  const catalog = Object.assign(base, {
    lookup: await loadLookup(build, "catalog", base.source, signal),
  });
  if (ctx.build === build) ctx.catalog = catalog;
  return catalog;
}
