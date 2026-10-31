import type { CatalogueMetadata } from "../../src/lib/catalogues/types.ts";
import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { readLines } from "./io/lines.ts";
import { writeAtomic } from "./io/atomic.ts";
import { CATALOG_HEADER } from "./clinvar.ts";
import { validateCatalogRow } from "./validate.ts";
import { log } from "./log.ts";

// Stable public examples show different genes, claims and review levels in either build.
const EXAMPLE_VARIATIONS = ["132807", "1131472", "39357"];

/** A merge may discard passed loci only when chromosome sections and positions stay ordered. */
export function catalogueOrder(build: string) {
  const chromosomes: string[] = [];
  let previousChromosome = "",
    previousPosition = 0;
  const locusKeys = new Set<string>();
  return {
    chromosomes,
    add(chrom: string, pos: number, ref: string, alt: string) {
      if (chrom !== previousChromosome) {
        if (chromosomes.includes(chrom))
          throw new Error(`${build}: catalogue chromosome sections must be contiguous`);
        chromosomes.push(chrom);
        previousPosition = 0;
        locusKeys.clear();
      }
      if (pos < previousPosition)
        throw new Error(`${build}: catalogue positions must be sorted within each chromosome`);
      if (pos !== previousPosition) locusKeys.clear();
      const allele = `${ref}:${alt}`;
      if (locusKeys.has(allele)) throw new Error(`${build}: duplicate catalogue variant key`);
      locusKeys.add(allele);
      previousChromosome = chrom;
      previousPosition = pos;
    },
  };
}

/** Describe a sorted catalogue without retaining all keys, rows or decoded blocks. */
export async function catalogueMetadata(file: string, build: string): Promise<CatalogueMetadata> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  const order = catalogueOrder(build);
  const metadata: CatalogueMetadata = {
    schema: 1,
    build,
    source: { size, sha256: hash.digest("hex") },
    chromosomes: order.chromosomes,
    n: 0,
    header: "",
    byClass: {},
    byStars: {},
    sample: [],
    examples: [],
  };
  const examples = new Map<string, string>();
  for await (const line of readLines(file)) {
    if (!metadata.header) {
      if (line !== CATALOG_HEADER) throw new Error(`${build}: unrecognized catalogue header`);
      metadata.header = line;
      continue;
    }
    if (!line) continue;
    const fields = validateCatalogRow(line);
    order.add(fields[0]!, +fields[1]!, fields[2]!, fields[3]!);
    const classification = fields[4]!,
      stars = fields[5]!;
    metadata.byClass[classification] = (metadata.byClass[classification] || 0) + 1;
    metadata.byStars[stars] = (metadata.byStars[stars] || 0) + 1;
    if (metadata.sample.length < 6) metadata.sample.push(line);
    if (EXAMPLE_VARIATIONS.includes(fields[12]!)) examples.set(fields[12]!, line);
    metadata.n++;
  }
  if (!metadata.header || !metadata.n)
    throw new Error(`${build}: cannot describe an empty catalogue`);
  metadata.examples = EXAMPLE_VARIATIONS.flatMap((id) => {
    const line = examples.get(id);
    return line ? [line] : [];
  });
  return metadata;
}

export async function buildCatalogMetadata({ paths, build }: ResolvedOptions & { build: string }) {
  const metadata = await catalogueMetadata(paths.catalog(build), build);
  writeAtomic(paths.catalogMetadata(build), JSON.stringify(metadata) + "\n");
  log(
    `${build}: summary of ${metadata.n.toLocaleString()} records → ${paths.catalogMetadata(build)}`,
  );
  return metadata;
}

export async function checkCatalogMetadata({ paths, build }: ResolvedOptions & { build: string }) {
  const actual = JSON.parse(fs.readFileSync(paths.catalogMetadata(build), "utf8"));
  const expected = await catalogueMetadata(paths.catalog(build), build);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${build}: catalogue metadata is stale or invalid. Run data:metadata.`);
  log(`${build}: catalogue summary, sorted order and compressed-file digest validated`);
}
