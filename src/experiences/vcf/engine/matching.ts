import type { ByteSource, Progress, Status } from "../../../lib/io/types.ts";
import type { CatalogueMap } from "../../../lib/catalogues/catalogue-ranges.ts";
import type { VcfMatch } from "../types.ts";
import { streamVariants } from "./vcf.ts";
import { gtIdx, varKey } from "./identity.ts";
import { addUniqueMatch } from "./match-identity.ts";
import { parseCatalogEntry, RESULT_ORDER, resultSummary } from "../../../lib/results/evidence.ts";
import { readCatalogueEntries } from "../../../lib/catalogues/catalogue-ranges.ts";

export async function findMatches(
  source: ByteSource,
  map: CatalogueMap,
  onProgress?: Progress,
  signal?: AbortSignal,
  onStatus?: Status,
) {
  const unique = new Map<string, VcfMatch>();
  const observed: {
    key: string;
    copies: number;
    ploidy: number;
    gt: string;
    partialCall: boolean;
    f: string[];
  }[] = [];
  await streamVariants(
    source,
    (f) => {
      if (f[4] === "." || (f[6] !== "PASS" && f[6] !== ".")) return;
      const alts = f[4]!.split(",");
      let idx: number[] | undefined;
      alts.forEach((alt, i) => {
        const key = varKey(f[0]!, f[1]!, f[3]!, alt);
        if (!map.has(key)) return;
        // Most VCF variants are absent from the catalogue. Decode the genotype
        // only when an exact allele key could produce a result.
        idx ??= gtIdx(f);
        const copies = idx.filter((x) => x === i + 1).length;
        if (!copies) return;
        const gt = (f[9] || "").split(":")[0],
          ploidy = gt!.split(/[/|]/).length;
        const partialCall = !/^\d+(?:[/|]\d+)*$/.test(gt!) || idx.some((i) => i > alts.length);
        observed.push({ key, copies, ploidy, gt: gt!, partialCall, f });
      });
    },
    onProgress,
    signal,
  );
  const entries = await readCatalogueEntries(
    map,
    observed.map((hit) => hit.key),
    signal,
    onStatus,
  );
  for (const { key, ...hit } of observed)
    addUniqueMatch(unique, { ...parseCatalogEntry(entries.get(key)!), ...hit });
  const hits = [...unique.values()];
  const rank = (h: VcfMatch) => RESULT_ORDER.indexOf(resultSummary(h).label);
  hits.sort(
    (a, b) =>
      rank(a) - rank(b) || b.stars - a.stars || (a.afmax ?? Infinity) - (b.afmax ?? Infinity),
  );
  return hits;
}
