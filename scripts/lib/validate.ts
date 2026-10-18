import type { MarkerData } from "../../src/lib/catalogues/types.ts";
import type { BaseMarker } from "./markers.ts";
import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import { CATALOG_HEADER, CATALOG_COLUMNS } from "./clinvar.ts";
import { DATASETS } from "./config.ts";
import { VARIANT_ID, markerTarget } from "./markers.ts";
import { readLines, requireFiles, log } from "./util.ts";
import { hasStudyEvidence } from "./reference/study-evidence.ts";

const validFraction = (value: string) =>
  [".", "N/A"].includes(value) ||
  (value !== "" && Number.isFinite(+value) && +value >= 0 && +value <= 1);
export function validateCatalogRow(line: string) {
  const fields = line.split("\t");
  if (
    fields.length !== CATALOG_COLUMNS.length ||
    !/^[1-9]\d*$/.test(fields[1]!) ||
    !/^[ACGTN]{1,50}$/.test(fields[2]!) ||
    !/^[ACGTN]{1,50}$/.test(fields[3]!) ||
    !["P", "LP", "PLP", "C", "O"].includes(fields[4]!) ||
    !/^[0-4]$/.test(fields[5]!)
  )
    throw new Error("Invalid catalogue identity, classification, review stars or column count");
  if (
    !validFraction(fields[8]!) ||
    !validFraction(fields[10]!) ||
    !/^(?:\.|\d+)$/.test(fields[11]!)
  )
    throw new Error("Invalid catalogue frequency or allele number");
  if (fields[8] !== "." && !VARIANT_ID.test(fields[22]!))
    throw new Error("Frequency is missing its GRCh38 source key");
  if (fields[7]!.split("|").length !== fields[23]!.split("|").length)
    throw new Error("Condition names and identifier groups are misaligned");
  if (
    !/^(?:\.|\d+)$/.test(fields[24]!) ||
    !validFraction(fields[26]!) ||
    ![".", "PASS", "EXOMES_FILTERED", "GENOMES_FILTERED", "BOTH_FILTERED"].includes(fields[25]!)
  )
    throw new Error("Invalid gnomAD joint counts, filters or discordance statistic");
  if (fields[24] !== "." && (+fields[24]! > +fields[11]! || fields[11] === "."))
    throw new Error("gnomAD allele count exceeds measured copies");
  if (fields[8] !== "." && (fields[24] === "." || fields[25] === "."))
    throw new Error("Frequency lacks joint source metadata; rebuild the catalogue");
  return fields;
}
export async function checkReference({ paths, build }: ResolvedOptions & { build: string }) {
  requireFiles(paths.catalog(build), paths.markers(build));
  let count = 0,
    header = false;
  for await (const line of readLines(paths.catalog(build))) {
    if (!header) {
      if (line !== CATALOG_HEADER) throw new Error(`${build}: unrecognized catalogue schema`);
      header = true;
      continue;
    }
    if (!line) continue;
    try {
      validateCatalogRow(line);
    } catch (error) {
      throw new Error(
        `${build} catalogue row ${count + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    count++;
  }
  if (!count) throw new Error(`${build}: empty catalogue`);
  const data: MarkerData = JSON.parse(fs.readFileSync(paths.markers(build), "utf8"));
  const base = (JSON.parse(fs.readFileSync(paths.markerBase, "utf8")) as BaseMarker[]).filter(
    hasStudyEvidence,
  );
  if (
    data.build !== build ||
    data.dataset !== DATASETS[build] ||
    !Array.isArray(data.markers) ||
    data.markers.length !== base.length
  )
    throw new Error(`${build}: invalid marker dataset or count`);
  const seen = new Set();
  for (const marker of data.markers) {
    const original = base.find((item) => item.rs === marker.rs);
    if (!original || seen.has(marker.rs) || !hasStudyEvidence(marker))
      throw new Error(`${build}: duplicate or uncited marker`);
    seen.add(marker.rs);
    const target = markerTarget(original, build);
    if (
      `${marker.chrom}-${marker.pos}-${marker.ref}-${marker.alt}` !== target.variant ||
      (marker.effIsAlt ? marker.alt : marker.ref) !== target.effectAllele ||
      JSON.stringify(marker.read) !== JSON.stringify(original.read) ||
      JSON.stringify(marker.cite) !== JSON.stringify(original.cite) ||
      marker.studyNote !== original.studyNote ||
      marker.source !== "joint" ||
      marker.gnomadKey !== markerTarget(original, "GRCh38").variant
    )
      throw new Error(`${build} ${marker.rs}: marker identity or evidence changed`);
    if (
      !validFraction(String(marker.af)) ||
      Object.values(marker.pops).some((value) => !validFraction(String(value)))
    )
      throw new Error(`${build} ${marker.rs}: invalid marker frequencies`);
  }
  log(
    `${build}: ${count.toLocaleString()} catalogue rows and ${data.markers.length} cited markers validated`,
  );
  return { count, markers: data.markers.length };
}
