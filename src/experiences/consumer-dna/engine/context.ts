import type {
  ConsumerSource,
  ConsumerHeader,
  ConsumerCounts,
  ConsumerMarkerHit,
  LookupIssue,
  RsidLookup,
} from "../types.ts";
import type { MarkerData } from "../../../lib/catalogues/types.ts";
import type { loadRangeCatalogue } from "../../../lib/catalogues/catalogue-ranges.ts";
import type { findMatches } from "./matching.ts";
import type { Scan } from "../../../lib/async/shared-scan.ts";
interface ConsumerContext {
  source: ConsumerSource | null;
  header: ConsumerHeader | null;
  stats: Awaited<ReturnType<typeof consumerStats>> | null;
  rowExamples: Awaited<ReturnType<typeof consumerStats>> | null;
  markerHits: Record<string, ConsumerMarkerHit> | null;
  markerIssues: LookupIssue[];
  matchIssues: LookupIssue[];
  matches: Awaited<ReturnType<typeof findMatches>> | null;
  build: string | null;
  markers?: MarkerData & { lookup: RsidLookup };
  catalog?: (Awaited<ReturnType<typeof loadRangeCatalogue>> & { lookup: RsidLookup }) | undefined;
}
import { consumerStats } from "./statistics.ts";
import { sharedScan } from "../../../lib/async/shared-scan.ts";

export const ctx: ConsumerContext = {
  source: null,
  header: null,
  stats: null,
  rowExamples: null,
  markerHits: null,
  markerIssues: [],
  matches: null,
  matchIssues: [],
  build: null,
};
let selectionController = new AbortController();
const scans = new WeakMap<
  ConsumerSource,
  Scan<Awaited<ReturnType<typeof consumerStats>>, [number, ConsumerCounts]>
>();

export function selectSource(source: ConsumerSource | null) {
  selectionController.abort();
  selectionController = new AbortController();
  Object.assign(ctx, {
    source,
    header: source?.header || null,
    build: null,
    stats: null,
    rowExamples: null,
    markerHits: null,
    markerIssues: [],
    matches: null,
    matchIssues: [],
  });
}
export async function ensureHeader() {
  if (!ctx.source) throw new Error("Choose a consumer DNA file first.");
  ctx.header = ctx.source.header;
}
export async function ensureStats(
  onProgress: (fraction: number, counts: ConsumerCounts) => void = () => {},
) {
  const source = ctx.source;
  await ensureHeader();
  if (ctx.source !== source) throw new DOMException("The selected genome changed.", "AbortError");
  if (ctx.stats) {
    onProgress(1, ctx.stats);
    return ctx.stats;
  }
  const signal = selectionController.signal;
  const stats = await sharedScan(
    scans,
    source!,
    (report) => consumerStats(source!, report, signal),
    onProgress,
  );
  if (ctx.source !== source) throw new DOMException("The selected genome changed.", "AbortError");
  ctx.stats = stats;
  onProgress(1, stats);
  return stats;
}
