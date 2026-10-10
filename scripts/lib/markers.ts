import type { StudyCitation } from "../../src/lib/catalogues/types.ts";
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
interface AlleleCounts {
  ac: number;
  an: number;
}
interface FrequencyCounts extends AlleleCounts {
  populations?: (AlleleCounts & { id: string })[];
}
interface GnomadVariant {
  variant_id: string;
  ref: string;
  alt: string;
  genome?: FrequencyCounts | null;
  exome?: FrequencyCounts | null;
}
import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import { DATASETS, SOURCES } from "./config.ts";
import { hasStudyEvidence } from "./reference/study-evidence.ts";
import { retry, writeAtomic, log } from "./util.ts";

const POPULATIONS: Record<string, string> = {
  afr: "African",
  amr: "Latino/Admixed American",
  asj: "Ashkenazi Jewish",
  eas: "East Asian",
  fin: "Finnish",
  mid: "Middle Eastern",
  nfe: "European (non-Finnish)",
  sas: "South Asian",
};
export const VARIANT_ID = /^(?:[1-9]|1[0-9]|2[0-2]|X|Y)-[1-9]\d*-[ACGT]+-[ACGT]+$/;
const FIELDS =
  "variant_id ref alt genome { ac an populations { id ac an } } exome { ac an populations { id ac an } }";

function alleleFrequency(counts: AlleleCounts) {
  if (
    !Number.isSafeInteger(counts.an) ||
    counts.an <= 0 ||
    !Number.isSafeInteger(counts.ac) ||
    counts.ac < 0 ||
    counts.ac > counts.an
  )
    throw new Error("Invalid gnomAD allele counts");
  return +(counts.ac / counts.an).toFixed(4);
}
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
export function markerOutput(
  marker: BaseMarker,
  build: string,
  variant: GnomadVariant | null | undefined,
) {
  const target = markerTarget(marker, build);
  if (!variant || variant.variant_id !== target.variant)
    throw new Error(`${marker.rs}: gnomAD returned a different or missing variant`);
  const [chrom, position, ref, alt] = target.variant.split("-");
  if (variant.ref !== ref || variant.alt !== alt)
    throw new Error(`${marker.rs}: gnomAD allele mismatch`);
  const frequency = (variant.genome?.an ?? 0) > 0 ? variant.genome : variant.exome;
  if (!frequency) throw new Error(`${marker.rs}: frequency data unavailable`);
  const pops: Record<string, number> = {};
  for (const population of frequency.populations || [])
    if (POPULATIONS[population.id] && population.an)
      pops[population.id] = alleleFrequency(population);
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
    af: alleleFrequency(frequency),
    pops,
    source: frequency === variant.genome ? "genomes" : "exomes",
    cite: marker.cite,
    ...(marker.studyNote ? { studyNote: marker.studyNote } : {}),
  };
}

export async function buildMarkers(
  { paths, build = "GRCh38", fresh = false, offline = false }: ResolvedOptions,
  { fetcher = fetch } = {},
) {
  if (offline && fresh) throw new Error("--offline and --fresh cannot be combined");
  const base = (JSON.parse(fs.readFileSync(paths.markerBase, "utf8")) as BaseMarker[]).filter(
    hasStudyEvidence,
  );
  if (!base.length) throw new Error("No cited markers; previous marker index was not changed");
  const markers = [];
  for (const marker of base) {
    const target = markerTarget(marker, build);
    if (!/^rs\d+$/.test(marker.rs)) throw new Error("Invalid marker rsID");
    const cache = path.join(paths.data, "markers", `${build}-${marker.rs}.json`);
    let variant;
    if (!fresh && fs.existsSync(cache)) {
      const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
      if (saved.dataset === DATASETS[build] && saved.variant?.variant_id === target.variant)
        variant = saved.variant;
    }
    if (!variant) {
      if (offline)
        throw new Error(
          `No compatible cached marker response at ${cache}. Run npm run data:markers -- --build ${build} first.`,
        );
      variant = await retry(async () => {
        const response = await fetcher(SOURCES.gnomad, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            query: `{ variant(variantId: ${JSON.stringify(target.variant)}, dataset: ${DATASETS[build]}) { ${FIELDS} } }`,
          }),
        });
        if (!response.ok) throw new Error(`gnomAD: HTTP ${response.status}`);
        const result = (await response.json()) as {
          errors?: { message: string }[];
          data?: { variant?: GnomadVariant | null };
        };
        if (result.errors?.length)
          throw new Error(result.errors.map((error) => error.message).join("; "));
        markerOutput(marker, build, result.data?.variant); // Never cache invalid responses.
        return result.data?.variant;
      });
      writeAtomic(
        cache,
        JSON.stringify(
          { dataset: DATASETS[build], fetchedAt: new Date().toISOString(), variant },
          null,
          2,
        ) + "\n",
      );
    }
    markers.push(markerOutput(marker, build, variant));
    log(`${marker.rs}: ${target.variant}`);
  }
  writeAtomic(
    paths.markers(build),
    JSON.stringify({ build, dataset: DATASETS[build], pops: POPULATIONS, markers }, null, 1) + "\n",
  );
  log(`${build}: ${markers.length} cited markers → ${paths.markers(build)}`);
  return markers;
}
