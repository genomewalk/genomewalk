import type { ByteSource, Progress, Status } from "../../../lib/io/types.ts";
import { bgzfLineBatches } from "../../../lib/io/bgzf-lines.ts";
import { yieldToLoop } from "../../../lib/async/schedule.ts";
import { withReadingContext } from "../../../lib/diagnostics/reading.ts";
import { catalogueRows, matchingRows, type CatalogueRows } from "../../../lib/catalogues/rows.ts";
import type { VcfMatch } from "../types.ts";
import { streamVariants } from "./vcf.ts";
import { gtIdx, normChrom, varKey } from "./identity.ts";
import { addUniqueMatch } from "./match-identity.ts";
import { parseCatalogEntry, RESULT_ORDER, resultSummary } from "../../../lib/results/evidence.ts";

// Internal control flow only: never include coordinates or file text in diagnostics.
class DifferentRecordOrder extends Error {}

function* observations(f: string[], has: (key: string) => boolean) {
  if (f[4] === "." || (f[6] !== "PASS" && f[6] !== ".")) return;
  const alts = (f[4] || "").split(",");
  let idx: number[] | undefined;
  for (let i = 0; i < alts.length; i++) {
    const key = varKey(f[0]!, f[1]!, f[3]!, alts[i]!);
    if (!has(key)) continue;
    idx ??= gtIdx(f);
    const copies = idx.filter((x) => x === i + 1).length;
    if (!copies) continue;
    const gt = (f[9] || "").split(":")[0]!;
    yield {
      key,
      f,
      copies,
      gt,
      ploidy: gt.split(/[/|]/).length,
      partialCall: !/^\d+(?:[/|]\d+)*$/.test(gt) || idx.some((i) => i > alts.length),
    };
  }
}

type Observation = ReturnType<typeof observations> extends Generator<infer T> ? T : never;
const sortMatches = (unique: Map<string, VcfMatch>) => {
  const rank = (h: VcfMatch) => RESULT_ORDER.indexOf(resultSummary(h).label);
  return [...unique.values()].sort(
    (a, b) =>
      rank(a) - rank(b) || b.stars - a.stars || (a.afmax ?? Infinity) - (b.afmax ?? Infinity),
  );
};
const add = (unique: Map<string, VcfMatch>, row: string, hit: Observation) => {
  const { f, copies, gt, ploidy, partialCall } = hit;
  addUniqueMatch(unique, { ...parseCatalogEntry(row), f, copies, gt, ploidy, partialCall });
};

/** Retain one catalogue position at a time, including all alleles at that position. */
async function* catalogueLoci(catalogue: CatalogueRows, signal?: AbortSignal) {
  let locus: { chrom: string; pos: number; rows: Map<string, string> } | undefined;
  for await (const line of catalogueRows(catalogue, signal)) {
    const [chrom, position, ref, alt] = line.split("\t", 4);
    const pos = Number(position);
    if (locus && (locus.chrom !== chrom || locus.pos !== pos)) {
      yield locus;
      locus = undefined;
    }
    locus ??= { chrom: chrom!, pos, rows: new Map() };
    locus.rows.set(`${chrom}:${position}:${ref}:${alt}`, line);
  }
  if (locus) yield locus;
}

/** One pass over each sorted input. No catalogue-wide membership map or genome-key set. */
async function mergeMatches(
  source: ByteSource,
  catalogue: CatalogueRows & { chromosomes: string[] },
  onProgress?: Progress,
  signal?: AbortSignal,
) {
  const ranks = new Map(catalogue.chromosomes.map((chrom, i) => [chrom, i]));
  const unique = new Map<string, VcfMatch>();
  const loci = catalogueLoci(catalogue, signal);
  let current = await loci.next();
  let previousRank = -1,
    previousPos = -1,
    lastTick = performance.now();
  try {
    for await (const { lines, progress } of bgzfLineBatches(source, signal)) {
      for (const line of lines) {
        if (!line || line.startsWith("#")) continue;
        const f = line.split("\t");
        const rank = ranks.get(normChrom(f[0]!));
        const pos = Number(f[1]);
        // Contigs absent from this public catalogue cannot produce matches.
        if (rank === undefined || !Number.isSafeInteger(pos) || pos < 1) continue;
        if (rank < previousRank || (rank === previousRank && pos < previousPos))
          throw new DifferentRecordOrder();
        previousRank = rank;
        previousPos = pos;
        while (!current.done) {
          const catalogRank = ranks.get(current.value.chrom)!;
          if (catalogRank > rank || (catalogRank === rank && current.value.pos >= pos)) break;
          current = await loci.next();
        }
        if (current.done || current.value.chrom !== normChrom(f[0]!) || current.value.pos !== pos)
          continue;
        const rows = current.value.rows;
        for (const hit of observations(f, (key) => rows.has(key)))
          add(unique, rows.get(hit.key)!, hit);
      }
      if (performance.now() - lastTick > 50) {
        signal?.throwIfAborted();
        onProgress?.(progress * 0.95);
        await yieldToLoop();
        lastTick = performance.now();
      }
    }
    // Exhaust BOTH inputs: late genome disorder and catalogue integrity failures matter.
    while (!current.done) current = await loci.next();
    signal?.throwIfAborted();
    onProgress?.(1);
    return sortMatches(unique);
  } catch (error) {
    if (error instanceof DifferentRecordOrder) throw error;
    throw withReadingContext(error, { readerKind: "vcf", readingStep: "records" });
  } finally {
    await loci.return(undefined);
  }
}

/** Compatibility for unsorted files: retain public identities, never all personal variants. */
async function unorderedMatches(
  source: ByteSource,
  catalogue: CatalogueRows,
  onProgress?: Progress,
  signal?: AbortSignal,
  onStatus?: Status,
) {
  async function collect() {
    onStatus?.("Preparing catalogue identities for this file’s record order…");
    const keys = new Set<string>();
    for await (const line of catalogueRows(catalogue, signal, (p) => onProgress?.(p * 0.2)))
      keys.add(line.split("\t", 4).join(":"));
    const observed: Observation[] = [];
    onStatus?.("Matching variants locally…");
    await streamVariants(
      source,
      (f) => {
        for (const hit of observations(f, (key) => keys.has(key))) observed.push(hit);
      },
      (p) => onProgress?.(0.2 + p * 0.6),
      signal,
    );
    return observed;
  }
  const observed = await collect(); // Public identity set is now eligible for collection.
  onStatus?.("Reading evidence for matched variants…");
  const rows = await matchingRows(catalogue, new Set(observed.map((hit) => hit.key)), signal, (p) =>
    onProgress?.(0.8 + p * 0.2),
  );
  const unique = new Map<string, VcfMatch>();
  for (const hit of observed) add(unique, rows.get(hit.key)!, hit);
  signal?.throwIfAborted();
  onProgress?.(1);
  return sortMatches(unique);
}

export async function findMatches(
  source: ByteSource,
  catalogue: CatalogueRows,
  onProgress?: Progress,
  signal?: AbortSignal,
  onStatus?: Status,
) {
  signal?.throwIfAborted();
  if ("chromosomes" in catalogue && Array.isArray(catalogue.chromosomes)) {
    onStatus?.("Matching the genome and catalogue as they stream…");
    try {
      return await mergeMatches(
        source,
        catalogue as CatalogueRows & { chromosomes: string[] },
        onProgress,
        signal,
      );
    } catch (error) {
      if (!(error instanceof DifferentRecordOrder)) throw error;
      // A supported input can use another contig order or have separated duplicates.
      // Retry from scratch; provisional results from the merge must not escape.
      onProgress?.(0);
    }
  }
  return unorderedMatches(source, catalogue, onProgress, signal, onStatus);
}
