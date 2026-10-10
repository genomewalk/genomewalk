import type { VariantIdentity } from "../../src/lib/catalogues/types.ts";
interface FrequencyRegion {
  chrom: string;
  start: number;
  end: number;
  keys: Set<string>;
}
interface FrequencyRow {
  key: string;
  af: string;
  grp: string;
  afmax: string;
  an: number;
}
import type { ResolvedOptions } from "./types.ts";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { SOURCES } from "./config.ts";
import { parseClinvar, FREQUENCY_HEADER } from "./clinvar.ts";
import { readLines, requireFiles, ensureTool, retry, atomicWriter, log } from "./util.ts";

export function clusterTargets(
  targets: Map<string, VariantIdentity[]>,
  gap = 20_000,
  span = 150_000,
) {
  const regions: FrequencyRegion[] = [];
  for (const [chrom, records] of targets) {
    let current;
    for (const record of [...records].sort((a, b) => a.pos - b.pos)) {
      if (!current || record.pos - current.end > gap || record.pos - current.start > span) {
        current = {
          chrom,
          start: Math.max(0, record.pos - 2),
          end: record.pos + 1,
          keys: new Set<string>(),
        };
        regions.push(current);
      }
      current.end = record.pos + 1;
      current.keys.add(`${record.pos}:${record.ref}:${record.alt}`);
    }
  }
  return regions;
}

function fraction(value: string, name: string) {
  if (value === "." || value === "" || value === "N/A") return ".";
  if (!Number.isFinite(+value) || +value < 0 || +value > 1)
    throw new Error(`Invalid ${name} in UCSC gnomAD row`);
  return value;
}
export function parseBigBed(line: string, region: FrequencyRegion) {
  const fields = line.split("\t");
  if (fields.length < 27)
    throw new Error("UCSC gnomAD schema changed: expected at least 27 fields");
  // UCSC v4.1 schema: position 21, REF/ALT 9/10, AF 14, AN 13, group 23, group AF 26.
  const key = `${fields[21]}:${fields[9]}:${fields[10]}`;
  if (!region.keys.has(key)) return null;
  const an = +fields[13]!;
  if (!Number.isSafeInteger(an) || an < 0)
    throw new Error("Invalid allele number in UCSC gnomAD row");
  const af = fraction(fields[14]!, "AF"),
    afmax = fraction(fields[26]!, "group AF");
  if (!an || af === ".") return null;
  return { key: `${region.chrom}:${key}`, af, grp: fields[23] || ".", afmax, an };
}

export function extractRegion(tool: string, url: string, region: FrequencyRegion) {
  return new Promise<FrequencyRow[]>((resolve, reject) => {
    const child = spawn(
      tool,
      [`-chrom=chr${region.chrom}`, `-start=${region.start}`, `-end=${region.end}`, url, "stdout"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    timeout.unref();
    const rows: FrequencyRow[] = [],
      lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let stderr = "",
      parseError: unknown;
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    lines.on("line", (line) => {
      if (parseError) return;
      try {
        const row = parseBigBed(line, region);
        if (row) rows.push(row);
      } catch (error) {
        parseError = error;
        child.kill();
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      lines.close();
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      lines.close();
      if (parseError) reject(parseError);
      else if (code !== 0)
        reject(
          new Error(
            `bigBedToBed failed at chr${region.chrom}:${region.start}-${region.end} (${signal || code}): ${stderr.trim()}`,
          ),
        );
      else resolve(rows);
    });
  });
}

// Only complete, successful jobs contribute to an output. Equal AN prefers genomes.
export async function collectFrequencies(
  regions: FrequencyRegion[],
  {
    extract,
    jobs = 6,
    progress = () => {},
  }: {
    extract: (url: string, region: FrequencyRegion) => Promise<FrequencyRow[]>;
    jobs?: number;
    progress?: (done: number, total: number, count: number) => void;
  },
) {
  const tasks = regions.flatMap((region) =>
    SOURCES.bigBed.map((url, rank) => ({ region, url, rank })),
  );
  const best = new Map<string, FrequencyRow & { rank: number }>();
  let next = 0,
    done = 0,
    failure: unknown;
  async function worker() {
    while (!failure && next < tasks.length) {
      const { region, url, rank } = tasks[next++]!;
      try {
        for (const row of await extract(url, region)) {
          const previous = best.get(row.key);
          if (!previous || row.an > previous.an || (row.an === previous.an && rank > previous.rank))
            best.set(row.key, { ...row, rank });
        }
        progress(++done, tasks.length, best.size);
      } catch (error) {
        failure ||= error;
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  if (failure) throw failure;
  return best;
}

export async function buildFrequencies(options: ResolvedOptions) {
  const { paths, chrom, jobs = 6 } = options;
  requireFiles(paths.clinvar("GRCh38"));
  const targets = new Map<string, Map<string, NonNullable<ReturnType<typeof parseClinvar>>>>();
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
  const ordered = new Map(
    [...targets].map(([key, values]) => [key, [...values.values()].sort((a, b) => a.pos - b.pos)]),
  );
  const regions = clusterTargets(ordered);
  log(`${regions.length} regions × exomes and genomes; ${jobs} concurrent jobs`);
  const tool = options.tool || process.env["BIGBED_TO_BED"] || (await ensureTool(paths.tool));
  const best = await collectFrequencies(regions, {
    jobs: +jobs,
    extract: (url, region) => retry(() => extractRegion(tool, url, region)),
    progress: (done, total, count) => {
      if (done % 200 === 0 || done === total)
        log(`${done}/${total} fetches; ${count.toLocaleString()} matches`);
    },
  });
  const destination = paths.frequencies + (chrom ? `.chr${chrom}` : "");
  const output = atomicWriter(destination);
  try {
    output.write(FREQUENCY_HEADER + "\n");
    for (const records of ordered.values())
      for (const record of records) {
        const row = best.get(record.key);
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
            ].join("\t") + "\n",
          );
      }
    output.commit();
  } catch (error) {
    output.abort();
    throw error;
  }
  log(`${best.size.toLocaleString()} frequency rows → ${destination}`);
}
