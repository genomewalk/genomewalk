import type { HeaderDataExamples } from "./header-data-examples.ts";
import type { VcfRowExamples } from "./row-diagram.ts";
import type { ByteSource } from "../../../lib/io/types.ts";
import type { Scan } from "../../../lib/async/shared-scan.ts";
import type { VcfCounts } from "../types.ts";
import { ctx, currentBuild, selectionSignal } from "./context.ts";
import { readHeader } from "./vcf.ts";
import { scanStats } from "./statistics.ts";
import { sharedScan } from "../../../lib/async/shared-scan.ts";

export async function ensureHeader() {
  const source = ctx.source;
  if (!source) throw new Error("Choose a VCF file first.");
  if (ctx.header) return ctx.header;
  const header = await readHeader(source, selectionSignal());
  if (ctx.source !== source) throw new DOMException("The selected genome changed.", "AbortError");
  ctx.header = header;
  return header;
}

export const knownSex = () => ctx.sex;

const statsScans = new WeakMap<
  AbortSignal,
  Scan<Awaited<ReturnType<typeof scanStats>>, [number, VcfCounts]>
>();

export const rowPreviews = new WeakMap<ByteSource, VcfRowExamples>();

export const headerPreviews = new WeakMap<ByteSource, HeaderDataExamples>();

export async function ensureStats(
  onProgress: (fraction: number, counts: VcfCounts) => void = () => {},
) {
  const source = ctx.source;
  const signal = selectionSignal();
  await ensureHeader();
  if (ctx.source !== source || signal !== selectionSignal())
    throw new DOMException("The selected genome changed.", "AbortError");
  if (ctx.stats) {
    onProgress(1, ctx.stats);
    return ctx.stats;
  }
  const build = currentBuild();
  const stats = await sharedScan(
    statsScans,
    signal,
    (report) => scanStats(source!, build, report, signal),
    onProgress,
  );
  if (ctx.source !== source || signal !== selectionSignal())
    throw new DOMException("The selected genome changed.", "AbortError");
  ctx.stats = stats;
  onProgress(1, stats);
  return stats;
}
