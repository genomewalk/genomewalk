import type { Evidence, VariantIdentity } from "../../../lib/catalogues/types.ts";
import type { ConsumerCall, ConsumerMatch, RsidLookup } from "../types.ts";
import { createCandidates } from "../lookup/index.ts";
import { streamCalls, callSignature, isAutosome } from "./calls.ts";
import { varKey } from "./identity.ts";
import { parseCatalogEntry, RESULT_ORDER, resultSummary } from "../../../lib/results/evidence.ts";
import {
  type CatalogueMap,
  readCatalogueEntries,
} from "../../../lib/catalogues/catalogue-ranges.ts";
import type { Progress, Status } from "../../../lib/io/types.ts";
import type { CallSource, LookupIssue } from "../types.ts";

// Preserve conflicting observations for inspection, but do not present an
// interpretation for any allele at a site with inconsistent file calls.
export function resultsWithoutConflicts(matches: ConsumerMatch[]) {
  const site = (hit: VariantIdentity) => `${hit.chrom}:${hit.pos}`;
  const skippedSites = new Set(matches.filter((hit) => hit.conflictingRecords).map(site));
  return {
    hits: matches.filter((hit) => !skippedSites.has(site(hit))),
    skippedSites: skippedSites.size,
  };
}

export async function findMatches(
  source: CallSource,
  map: CatalogueMap,
  onProgress?: Progress | null,
  signal?: AbortSignal,
  lookup: RsidLookup | null = null,
  onIssue?: (issue: LookupIssue) => void,
  onStatus?: Status,
) {
  if (source.capabilities?.matching === false) return [];
  // Index lightweight identities; parse the full annotation only for candidates
  // observed in this file, rather than duplicating the whole catalogue in memory.
  const records = [];
  for (const [key, line] of map) {
    const [chrom, pos, ref, alt] = key.split(":") as [string, string, string, string];
    if (/^[ACGT]$/.test(ref) && /^[ACGT]$/.test(alt) && ref !== alt)
      records.push({ chrom, pos: +pos, ref, alt, line });
  }
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
      for (const candidate of candidates) {
        const entry = candidate;
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
    onProgress,
    signal,
  );
  const entries = await readCatalogueEntries(
    map,
    [...observed].filter(([, value]) => value.carried).map(([key]) => key),
    signal,
    onStatus,
  );
  const hits: ConsumerMatch[] = [];
  for (const [key, { calls, recordCount, carried: call }] of observed) {
    if (!call) continue;
    const entry = parseCatalogEntry(entries.get(key)!);
    hits.push({
      ...entry,
      call,
      copies: call.alleles.filter((a) => a === entry.alt).length,
      ploidy: call.ploidy,
      gt: call.gt,
      partialCall: call.status !== "called",
      // Even a row rejected by its rsID or ploidy can disagree at this site.
      conflictingRecords: siteCalls.get(`${entry.chrom}:${entry.pos}`)!.size > 1,
      recordCount,
      sourceCalls: [...calls.values()].map((c) => c.fields),
    });
  }
  const rank = (hit: Evidence) => RESULT_ORDER.indexOf(resultSummary(hit).label);
  return hits.sort(
    (a, b) =>
      rank(a) - rank(b) || b.stars - a.stars || (a.afmax ?? Infinity) - (b.afmax ?? Infinity),
  );
}
