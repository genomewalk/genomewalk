import type { CallSource, ConsumerCounts } from "../types.ts";
import { isAutosome, callSignature } from "./calls.ts";
import { countExampleCollector, completeRepeatExample } from "./count-examples.ts";
import { sexChromosomeSummary } from "./sex-chromosomes.ts";

export async function consumerStats(
  source: CallSource,
  onProgress?: (fraction: number, counts: ConsumerCounts) => void,
  signal?: AbortSignal,
) {
  const start = performance.now(),
    seen = new Map<string, string>(),
    conflicts = new Set<string>();
  const stats: ConsumerCounts = {
    records: 0,
    called: 0,
    missing: 0,
    partial: 0,
    unsupported: 0,
    eligible: 0,
    duplicates: 0,
    chrom: {},
    heterozygous: 0,
    diploid: 0,
    examples: {},
  };
  const captureExample = countExampleCollector(stats.examples);
  await source.readCalls(
    (call) => {
      stats.records++;
      stats.chrom[call.chrom] = (stats.chrom[call.chrom] || 0) + 1;
      if (call.status === "called") stats.called++;
      else if (call.status === "no-call") stats.missing++;
      else stats[call.status]++;
      if (call.canMatch) stats.eligible++;
      const key = `${call.chrom}:${call.pos}`,
        signature = callSignature(call);
      captureExample(call, seen.get(key), stats.records);
      if (seen.has(key)) {
        stats.duplicates++;
        if (seen.get(key) !== signature) conflicts.add(key);
      } else {
        seen.set(key, signature);
        if (call.status === "called" && isAutosome(call.chrom) && call.alleles.length === 2) {
          stats.diploid++;
          if (call.alleles[0] !== call.alleles[1]) stats.heterozygous++;
        }
      }
    },
    (fraction) => onProgress?.(fraction, stats),
    signal,
  );
  await completeRepeatExample(source, stats.examples, signal);
  // Heterozygosity is descriptive only. Conflicting sites are not a reliable
  // diploid denominator; omit that measure when this file contains any.
  return {
    ...stats,
    unique: seen.size,
    conflicts: conflicts.size,
    sexChromosomes: sexChromosomeSummary(source.build, seen, conflicts),
    seconds: (performance.now() - start) / 1000,
  };
}
