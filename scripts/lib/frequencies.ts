import type { VariantIdentity } from "../../src/lib/catalogues/types.ts";
import type { ResolvedOptions } from "./types.ts";
import type { FrequencyRegion, JointFrequency } from "./reference/gnomad-joint.ts";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FREQUENCY_SOURCE } from "./config.ts";
import { jointExtractor } from "./reference/gnomad-joint.ts";
import { parseClinvar, FREQUENCY_HEADER } from "./clinvar.ts";
import { readLines, requireFiles, retry, atomicWriter, writeAtomic, log } from "./util.ts";

/** Tabix's smallest bins span 16,384 bases; query each occupied bin once. */
export function clusterTargets(targets: Map<string, VariantIdentity[]>) {
  const regions: FrequencyRegion[] = [];
  for (const [chrom, records] of targets) {
    let current: FrequencyRegion | undefined;
    for (const record of [...records].sort((a, b) => a.pos - b.pos)) {
      const start = Math.floor((record.pos - 1) / 16384) * 16384;
      if (!current || current.start !== start) {
        current = { chrom, start, end: start + 16384, keys: new Set() };
        regions.push(current);
      }
      current.keys.add(`${record.pos}:${record.ref}:${record.alt}`);
    }
  }
  return regions;
}

export async function collectFrequencies(
  regions: FrequencyRegion[],
  {
    makeExtractor = jointExtractor,
    jobs = 3,
    progress = () => {},
  }: {
    makeExtractor?: () => (region: FrequencyRegion) => Promise<JointFrequency[]>;
    jobs?: number;
    progress?: (done: number, total: number, count: number) => void;
  } = {},
) {
  const rows = new Map<string, JointFrequency>();
  let next = 0,
    done = 0,
    failure: unknown;
  async function worker() {
    const extract = makeExtractor();
    while (!failure && next < regions.length) {
      const region = regions[next++]!;
      try {
        for (const row of await extract(region)) {
          if (rows.has(row.key)) throw new Error(`Duplicate gnomAD joint record: ${row.key}`);
          rows.set(row.key, row);
        }
        progress(++done, regions.length, rows.size);
      } catch (error) {
        failure ||= error;
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  if (failure) throw failure;
  return rows;
}

export async function buildFrequencies({
  paths,
  chrom,
  jobs = "3",
  fresh = false,
}: ResolvedOptions) {
  requireFiles(paths.clinvar("GRCh38"));
  const targets = new Map<string, Map<string, VariantIdentity>>();
  for await (const line of readLines(paths.clinvar("GRCh38"))) {
    const record = parseClinvar(line);
    if (
      !record ||
      !/^(?:[1-9]|1[0-9]|2[0-2]|X|Y)$/.test(record.chrom) ||
      (chrom && chrom !== record.chrom)
    )
      continue;
    if (!targets.has(record.chrom)) targets.set(record.chrom, new Map());
    targets.get(record.chrom)!.set(record.key, record);
  }
  if (!targets.size)
    throw new Error("No selected ClinVar targets; frequency index was not changed");
  const regions = clusterTargets(
    new Map([...targets].map(([chrom, rows]) => [chrom, [...rows.values()]])),
  );
  log(`${regions.length} occupied regions in gnomAD v4.1 joint VCF; ${jobs} concurrent jobs`);
  const rows = await collectFrequencies(regions, {
    jobs: +jobs,
    makeExtractor() {
      const extract = jointExtractor();
      return async (region) => {
        const identity = JSON.stringify([
          FREQUENCY_SOURCE,
          region.chrom,
          region.start,
          region.end,
          [...region.keys].sort(),
        ]);
        const hash = createHash("sha256").update(identity).digest("hex");
        const cache = path.join(
          paths.data,
          FREQUENCY_SOURCE,
          `${region.chrom}-${region.start}-${hash}.json`,
        );
        if (!fresh && fs.existsSync(cache)) {
          const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
          if (saved.identity !== identity || !Array.isArray(saved.rows))
            throw new Error(`Invalid joint cache: ${cache}`);
          return saved.rows as JointFrequency[];
        }
        // Public-source stalls can outlast the short retries used for small downloads.
        let attempt = 0;
        const rows = await retry(
          () => {
            if (attempt++)
              log(`Retry ${attempt}/6: gnomAD chr${region.chrom}:${region.start}-${region.end}`);
            return extract(region);
          },
          6,
          5_000,
        );
        writeAtomic(cache, JSON.stringify({ identity, rows }) + "\n");
        return rows;
      };
    },
    progress(done, total, count) {
      if (done % 50 === 0 || done === total)
        log(`${done}/${total} regions; ${count.toLocaleString()} joint matches`);
    },
  });
  const destination = paths.frequencies + (chrom ? `.chr${chrom}` : "");
  const output = atomicWriter(destination);
  try {
    output.write(FREQUENCY_HEADER + "\n");
    for (const records of targets.values())
      for (const [key, record] of records) {
        const row = rows.get(key);
        if (row)
          output.write(
            [
              record.chrom,
              record.pos,
              record.ref,
              record.alt,
              row.af,
              row.grp,
              row.afmax,
              row.an,
              row.ac,
              row.filter,
              row.discordanceP,
            ].join("\t") + "\n",
          );
      }
    output.commit();
  } catch (error) {
    output.abort();
    throw error;
  }
  log(`${rows.size.toLocaleString()} joint frequency rows → ${destination}`);
}
