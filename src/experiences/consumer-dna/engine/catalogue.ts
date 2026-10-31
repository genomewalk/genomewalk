import type { Status } from "../../../lib/io/types.ts";
import { loadCatalogue } from "../../../lib/catalogues/catalogue-stream.ts";
import { ctx } from "./context.ts";

/** Cache only the small public summary; matching streams catalogue rows on demand. */
export async function loadCatalog(signal?: AbortSignal, onStatus?: Status) {
  signal?.throwIfAborted();
  const build = ctx.build || "GRCh38";
  if (ctx.catalog && ctx.catalog.build === build) return ctx.catalog;
  const catalog = await loadCatalogue(build, signal, onStatus);
  if (ctx.build === build) ctx.catalog = catalog;
  return catalog;
}
