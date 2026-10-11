import type { CallSource, ConsumerMarkerHit, RsidLookup, LookupIssue } from "../types.ts";
import type { Marker, MarkerData } from "../../../lib/catalogues/types.ts";
import type { Progress } from "../../../lib/io/types.ts";
import { loadLookup, createCandidates } from "../lookup/index.ts";
import { streamCalls, callSignature, calledLetters } from "./calls.ts";
import { ctx } from "./context.ts";
import { hasStudyEvidence } from "../../../lib/catalogues/study-evidence.ts";
import { refUrl } from "./view/file.ts";

const FEATURED = ["rs671", "rs12913832", "rs17822931", "rs9923231", "rs4988235"];

export const featuredMarkers = (data: MarkerData) =>
  FEATURED.map((rs) => data.markers.find((m) => m.rs === rs)).filter(hasStudyEvidence);

export async function loadMarkers(signal?: AbortSignal) {
  if (ctx.markers && ctx.markers.build === ctx.build) return ctx.markers;
  const build = ctx.build;
  const res = await fetch(refUrl("markers.json"), { signal: signal ?? null });
  if (!res.ok) throw new Error(`markers download failed (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const data: MarkerData = JSON.parse(new TextDecoder().decode(bytes));
  if (data.build !== build) throw new Error("Marker reference build mismatch");
  const enriched = Object.assign(data, {
    lookup: await loadLookup(build, "markers", bytes, signal),
  });
  if (ctx.build === build) ctx.markers = enriched;
  return enriched;
}

export async function findMarkers(
  source: CallSource,
  markers: Marker[],
  onProgress?: Progress,
  signal?: AbortSignal,
  lookup: RsidLookup | null = null,
  onIssue?: (issue: LookupIssue) => void,
) {
  const hits: Record<string, ConsumerMarkerHit> = {};
  const candidatesFor = createCandidates(markers, lookup, "markers", source.build, onIssue);
  const positions = new Set(markers.map((marker) => `${marker.chrom}:${marker.pos}`));
  const siteCalls = new Map<string, Set<string>>();
  await streamCalls(
    source,
    (call) => {
      const position = `${call.chrom}:${call.pos}`;
      if (positions.has(position)) {
        if (!siteCalls.has(position)) siteCalls.set(position, new Set());
        siteCalls.get(position)!.add(callSignature(call));
      }
      for (const marker of candidatesFor(call)) {
        const letters = calledLetters(call);
        const usable =
          call.canMatch &&
          call.status === "called" &&
          letters.every((a) => a === marker.ref || a === marker.alt);
        const prior = hits[marker.rs];
        hits[marker.rs] = {
          call,
          letters,
          filter: call.filter,
          usable,
          conflicting:
            !!prior && (prior.conflicting || callSignature(prior.call) !== callSignature(call)),
        };
      }
    },
    onProgress,
    signal,
  );
  for (const hit of Object.values(hits)) {
    hit.conflicting ||= siteCalls.get(`${hit.call.chrom}:${hit.call.pos}`)!.size > 1;
    if (hit.conflicting) hit.usable = false;
  }
  return hits;
}
