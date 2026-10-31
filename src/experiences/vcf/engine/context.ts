import type { SupportedBuild } from "../../../lib/genetics/reference-build.ts";
import { detectBuild } from "./reference.ts";
import type { ByteSource } from "../../../lib/io/types.ts";
import type { MarkerData } from "../../../lib/catalogues/types.ts";
import type { loadCatalogue } from "../../../lib/catalogues/catalogue-stream.ts";
import type { VcfHeader, VcfMatch, VcfMarkerHit } from "../types.ts";
import type { scanStats } from "./statistics.ts";
interface VcfContext {
  source: ByteSource | null;
  header: VcfHeader | null;
  stats: Awaited<ReturnType<typeof scanStats>> | null;
  sex: string | null;
  markerHits: Record<string, VcfMarkerHit> | null;
  matches: VcfMatch[] | null;
  selectedBuild?: SupportedBuild;
  build?: string | null;
  markers?: MarkerData;
  catalog?: Awaited<ReturnType<typeof loadCatalogue>> | undefined;
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
export const currentBuild = () => {
  const detected = ctx.header ? detectBuild(ctx.header.meta) : "unknown";
  return detected === "unknown" ? ctx.selectedBuild || detected : detected;
};

export function selectSource(
  source: ByteSource | null,
  header: VcfHeader | null = null,
  selectedBuild?: SupportedBuild,
) {
  if (selectedBuild && (!header || detectBuild(header.meta) !== "unknown"))
    throw new Error("A build can only be selected when the file’s reference build is unknown.");
  controller.abort();
  controller = new AbortController();
  Object.assign(ctx, {
    source,
    header,
    selectedBuild,
    build: null,
    stats: null,
    sex: null,
    markerHits: null,
    matches: null,
  });
}
