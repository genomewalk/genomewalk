import type { VariantIdentity } from "../../../lib/catalogues/types.ts";
import type { ConsumerCall, ConsumerMatch, RsidLookup } from "../types.ts";
import { createCandidates } from "../lookup/index.ts";
import { streamCalls, callSignature, isAutosome } from "./calls.ts";
import { varKey } from "./identity.ts";
import { parseCatalogEntry } from "../../../lib/results/evidence.ts";
import { compareReviewPriority } from "../../../lib/results/priority.ts";
import { catalogueRows, type CatalogueRows } from "../../../lib/catalogues/rows.ts";
import type { Progress, Status } from "../../../lib/io/types.ts";
import type { CallSource, LookupIssue } from "../types.ts";
import { AppError } from "../../../lib/app-error.ts";

// Preserve conflicting observations for inspection, but do not present an
// interpretation for any allele at a site with inconsistent file calls.
export function resultsWithoutConflicts(matches: ConsumerMatch[]) {
  const site = (hit: VariantIdentity) => `${hit.chrom}:${hit.pos}`;
  const skippedSites = new Set(matches.filter((hit) => hit.conflictingRecords).map(site));
  return {
    hits: matches.filter((hit) => !skippedSites.has(site(hit))),
    needsVerification: matches
      .filter((hit) => skippedSites.has(site(hit)))
      .map((hit) => ({ ...hit, conflictingRecords: true })),
    skippedSites: skippedSites.size,
  };
}

/** Consumer exports need not be sorted. Keep public identities, never all file calls or catalogue payloads. */
async function observeCalls(
  source: CallSource,
  catalogue: CatalogueRows,
  lookup: RsidLookup | null,
  onIssue: ((issue: LookupIssue) => void) | undefined,
  onProgress: Progress | null | undefined,
  signal: AbortSignal | undefined,
  onStatus: Status | undefined,
) {
  onStatus?.("Reading catalogue variant identities…");
  const records: VariantIdentity[] = [];
  for await (const line of catalogueRows(catalogue, signal, (fraction) =>
    onProgress?.(fraction * 0.2),
  )) {
    const [chrom, pos, ref, alt] = line.split("\t", 4) as [string, string, string, string];
    if (/^[ACGT]$/.test(ref) && /^[ACGT]$/.test(alt) && ref !== alt)
      records.push({ chrom, pos: +pos, ref, alt });
  }
  // Coordinates remain authoritative even when the catalogue has no rsID for an allele.
  const candidatesFor = createCandidates(records, lookup, "catalog", source.build, onIssue);
  const positions = new Set(records.map((entry) => `${entry.chrom}:${entry.pos}`));
  const siteCalls = new Map<string, Set<string>>();
  const observed = new Map<
    string,
    {
      entry: VariantIdentity;
      calls: Map<string, ConsumerCall>;
      recordCount: number;
      carried: ConsumerCall | null;
    }
  >();
  onStatus?.("Matching your DNA file locally…");
  await streamCalls(
    source,
    (call) => {
      const position = `${call.chrom}:${call.pos}`;
      if (positions.has(position)) {
        if (!siteCalls.has(position)) siteCalls.set(position, new Set());
        siteCalls.get(position)!.add(callSignature(call));
      }
      if (!isAutosome(call.chrom) || call.alleles.length !== 2) return;
      const candidates = candidatesFor(call);
      const allowed = new Set(candidates.flatMap((entry) => [entry.ref, entry.alt]));
      const compatible = call.alleles.every((allele) => allowed.has(allele!));
      for (const entry of candidates) {
        const key = varKey(entry.chrom, entry.pos, entry.ref, entry.alt);
        let observation = observed.get(key);
        if (!observation) {
          observation = {
            entry,
            calls: new Map<string, ConsumerCall>(),
            recordCount: 0,
            carried: null,
          };
          observed.set(key, observation);
        }
        observation.recordCount++;
        observation.calls.set(callSignature(call), call);
        if (call.canMatch && compatible && call.alleles.includes(entry.alt))
          observation.carried ||= call;
      }
    },
    (fraction) => onProgress?.(0.2 + fraction * 0.6),
    signal,
  );
  // Returning only carried observations releases the candidate lookup and unused calls
  // before the second catalogue pass. Rejected calls still contribute site conflicts.
  const carried = new Map<
    string,
    {
      call: ConsumerCall;
      recordCount: number;
      sourceCalls: string[][];
      conflictingRecords: boolean;
    }
  >();
  for (const [key, { entry, calls, recordCount, carried: call }] of observed) {
    if (!call) continue;
    carried.set(key, {
      call,
      recordCount,
      sourceCalls: [...calls.values()].map((c) => c.fields),
      conflictingRecords: siteCalls.get(`${entry.chrom}:${entry.pos}`)!.size > 1,
    });
  }
  return carried;
}

export async function findMatches(
  source: CallSource,
  catalogue: CatalogueRows,
  onProgress?: Progress | null,
  signal?: AbortSignal,
  lookup: RsidLookup | null = null,
  onIssue?: (issue: LookupIssue) => void,
  onStatus?: Status,
) {
  signal?.throwIfAborted();
  if (source.capabilities?.matching === false) return [];
  const observed = await observeCalls(
    source,
    catalogue,
    lookup,
    onIssue,
    onProgress,
    signal,
    onStatus,
  );
  lookup = null;
  if (!observed.size) {
    onProgress?.(1);
    return [];
  }
  onStatus?.("Reading evidence for your matches…");
  const entries = new Map<string, ReturnType<typeof parseCatalogEntry>>();
  // Finish the stream even after all matches are found: its final hash validates the release.
  for await (const line of catalogueRows(catalogue, signal, (fraction) =>
    onProgress?.(0.8 + fraction * 0.2),
  )) {
    const key = line.split("\t", 4).join(":");
    if (observed.has(key)) entries.set(key, parseCatalogEntry(line));
  }
  const hits: ConsumerMatch[] = [];
  for (const [key, { call, recordCount, sourceCalls, conflictingRecords }] of observed) {
    const entry = entries.get(key);
    if (!entry)
      throw new AppError(
        "REFERENCE_INTEGRITY_FAILED",
        "A matched catalogue record is missing. Try again after refreshing the page.",
        { resource: "catalogue-entries" },
      );
    hits.push({
      ...entry,
      call,
      copies: call.alleles.filter((a) => a === entry.alt).length,
      ploidy: call.ploidy,
      gt: call.gt,
      partialCall: call.status !== "called",
      conflictingRecords,
      recordCount,
      sourceCalls,
    });
  }
  onProgress?.(1);
  return hits.sort(compareReviewPriority);
}
