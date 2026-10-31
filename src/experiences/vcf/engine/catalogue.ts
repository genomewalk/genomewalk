import type { Status } from "../../../lib/io/types.ts";
import { loadCatalogue } from "../../../lib/catalogues/catalogue-stream.ts";
import { ctx } from "./context.ts";

export async function loadCatalog(signal?: AbortSignal, onStatus?: Status) {
  signal?.throwIfAborted();
  const build = ctx.build;
  if (build !== "GRCh37" && build !== "GRCh38")
    throw new Error("A supported reference build is required for catalogue matching.");
  if (ctx.catalog && ctx.catalog.build === build) return ctx.catalog;
  const catalog = await loadCatalogue(build, signal, onStatus);
  if (ctx.build === build) ctx.catalog = catalog;
  return catalog;
}
