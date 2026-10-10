import type { ByteSource } from "../../../lib/io/types.ts";
import type { MarkerData } from "../../../lib/catalogues/types.ts";
import type { loadRangeCatalogue } from "../../../lib/catalogues/catalogue-ranges.ts";
import type { VcfHeader, VcfMatch, VcfMarkerHit } from "../types.ts";
import type { scanStats } from "./statistics.ts";
interface VcfContext {
  source: ByteSource | null;
  header: VcfHeader | null;
  stats: Awaited<ReturnType<typeof scanStats>> | null;
  sex: string | null;
  markerHits: Record<string, VcfMarkerHit> | null;
  matches: VcfMatch[] | null;
  build?: string | null;
  markers?: MarkerData;
  catalog?: Awaited<ReturnType<typeof loadRangeCatalogue>> | undefined;
}
// Personal derived data stays in memory for the active file only.
export const ctx: VcfContext = {
  source: null,
  header: null,
  stats: null,
  sex: null,
  markerHits: null,
  matches: null,
};
let controller = new AbortController();
export const selectionSignal = () => controller.signal;
export function selectSource(source: ByteSource | null, header: VcfHeader | null = null) {
  controller.abort();
  controller = new AbortController();
  Object.assign(ctx, {
    source,
    header,
    build: null,
    stats: null,
    sex: null,
    markerHits: null,
    matches: null,
  });
}
