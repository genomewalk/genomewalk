import type { StudyCitation } from "../../src/lib/catalogues/types.ts";
import type { JointFrequency } from "./reference/gnomad-joint.ts";
import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import { DATASETS, FREQUENCY_SOURCE } from "./config.ts";
import { POPULATIONS, jointExtractor } from "./reference/gnomad-joint.ts";
import { hasStudyEvidence } from "./reference/study-evidence.ts";
import { retry, writeAtomic, log } from "./util.ts";

export interface BaseMarker {
  rs: string;
  cat: string;
  gene: string;
  title: string;
  read: string[];
  cite: StudyCitation | StudyCitation[];
  studyNote?: string;
  targets: Record<string, { variant: string; effectAllele: string }>;
}
export const VARIANT_ID = /^(?:[1-9]|1[0-9]|2[0-2]|X|Y)-[1-9]\d*-[ACGT]+-[ACGT]+$/;
export function markerTarget(marker: BaseMarker, build: string) {
  const target = marker.targets?.[build];
  if (
    !target ||
    !VARIANT_ID.test(target.variant) ||
    ![target.variant.split("-")[2], target.variant.split("-")[3]].includes(target.effectAllele)
  )
    throw new Error(
      `${marker.rs}: add a verified ${build} variant ID and effectAllele to markers.base.json`,
    );
  return target;
}
export const markerCache = (data: string, rs: string) =>
  path.join(data, "markers", `${FREQUENCY_SOURCE}-${rs}.json`);

export function markerOutput(
  marker: BaseMarker,
  build: string,
  frequency: JointFrequency | null | undefined,
) {
  const target = markerTarget(marker, build);
  const source = markerTarget(marker, "GRCh38");
  if (!frequency || frequency.key !== source.variant.replaceAll("-", ":"))
    throw new Error(`${marker.rs}: gnomAD returned a different or missing variant`);
  if (
    !Number.isFinite(+frequency.af) ||
    +frequency.af < 0 ||
    +frequency.af > 1 ||
    frequency.an <= 0 ||
    frequency.ac > frequency.an
  )
    throw new Error(`${marker.rs}: invalid gnomAD counts`);
  const [chrom, position, ref, alt] = target.variant.split("-");
  const [, , sourceRef, sourceAlt] = source.variant.split("-");
  // Curated targets may move coordinates, but must describe the same oriented allele.
  if (ref !== sourceRef || alt !== sourceAlt || target.effectAllele !== source.effectAllele)
    throw new Error(`${marker.rs}: cross-build marker alleles require verification`);
  return {
    rs: marker.rs,
    cat: marker.cat,
    gene: marker.gene,
    title: marker.title,
    read: marker.read,
    chrom,
    pos: +position!,
    ref,
    alt,
    effIsAlt: target.effectAllele === alt,
    af: +frequency.af,
    pops: frequency.pops,
    source: "joint",
    gnomadKey: source.variant,
    gnomadFilter: frequency.filter,
    gnomadDiscordanceP: frequency.discordanceP === "." ? null : +frequency.discordanceP,
    cite: marker.cite,
    ...(marker.studyNote ? { studyNote: marker.studyNote } : {}),
  };
}

export async function buildMarkers(
  { paths, build = "GRCh38", fresh = false, offline = false }: ResolvedOptions,
  { extract = jointExtractor() } = {},
) {
  if (offline && fresh) throw new Error("--offline and --fresh cannot be combined");
  const base = (JSON.parse(fs.readFileSync(paths.markerBase, "utf8")) as BaseMarker[]).filter(
    hasStudyEvidence,
  );
  if (!base.length) throw new Error("No cited markers; previous marker index was not changed");
  const markers = [];
  for (const marker of base) {
    const target = markerTarget(marker, "GRCh38");
    if (!/^rs\d+$/.test(marker.rs)) throw new Error("Invalid marker rsID");
    const cache = markerCache(paths.data, marker.rs);
    let frequency: JointFrequency | undefined;
    if (!fresh && fs.existsSync(cache)) {
      const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
      if (
        saved.source === FREQUENCY_SOURCE &&
        saved.frequency?.key === target.variant.replaceAll("-", ":")
      )
        frequency = saved.frequency;
    }
    if (!frequency) {
      if (offline)
        throw new Error(
          `No compatible cached marker response at ${cache}. Run npm run data:markers first.`,
        );
      const [chrom, pos, ref, alt] = target.variant.split("-");
      frequency = await retry(async () => {
        const rows = await extract({
          chrom: chrom!,
          start: +pos! - 1,
          end: +pos!,
          keys: new Set([`${pos}:${ref}:${alt}`]),
        });
        if (rows.length !== 1) throw new Error(`${marker.rs}: expected one joint frequency record`);
        markerOutput(marker, build, rows[0]);
        return rows[0];
      });
      writeAtomic(
        cache,
        JSON.stringify({
          source: FREQUENCY_SOURCE,
          fetchedAt: new Date().toISOString(),
          frequency,
        }) + "\n",
      );
    }
    markers.push(markerOutput(marker, build, frequency));
    log(`${marker.rs}: ${target.variant} (joint GRCh38 source)`);
  }
  writeAtomic(
    paths.markers(build),
    JSON.stringify(
      { build, dataset: DATASETS[build], source: FREQUENCY_SOURCE, pops: POPULATIONS, markers },
      null,
      1,
    ) + "\n",
  );
  log(`${build}: ${markers.length} cited markers → ${paths.markers(build)}`);
  return markers;
}
