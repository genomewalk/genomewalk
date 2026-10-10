import type { ResolvedOptions } from "../lib/types.ts";
import type { MarkerData } from "../../src/lib/catalogues/types.ts";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { CATALOG_HEADER } from "../lib/clinvar.ts";
import { validateCatalogRow } from "../lib/validate.ts";
import { readLines, requireFiles, writeAtomic, log } from "../lib/util.ts";
import type { BinaryLike } from "crypto";

export const indexPath = (paths: ResolvedOptions["paths"], build: string) =>
  path.join(paths.output, "consumer-dna", build, "rsids.json.gz");
const digest = (bytes: BinaryLike) => createHash("sha256").update(bytes).digest("hex");
const rsid = (value: string) => /^(?:rs)?([1-9]\d*)$/i.exec(value)?.[1];
const singleBase = (ref: string, alt: string) =>
  /^[ACGT]$/.test(ref) && /^[ACGT]$/.test(alt) && ref !== alt;
const supportedChromosome = (chrom: string) => /^(?:[1-9]|1\d|2[0-2]|X|Y|MT)$/.test(chrom);
function add(index: Record<string, string[]>, id: string, key: string) {
  const number = rsid(id);
  if (!number) throw new Error(`Invalid rsID in public input: ${id}`);
  const keys = (index[`rs${number}`] ||= []);
  if (!keys.includes(key)) keys.push(key);
}

// A merge is accepted only from an explicitly supplied, attributed public map.
// Sharing a coordinate or an allele is never used to invent a retired-ID alias.
export function resolveAliases(
  input: { source: string; release: string; aliases: Record<string, string> } | null,
  known: Set<string>,
) {
  if (!input) return {};
  if (!input.source || !input.release || !input.aliases || Array.isArray(input.aliases))
    throw new Error("Alias input requires source, release and an aliases object");
  const links = new Map<string, string>();
  for (const [old, current] of Object.entries(input.aliases)) {
    if (!/^rs[1-9]\d*$/.test(old) || !/^rs[1-9]\d*$/.test(current) || old === current)
      throw new Error("Invalid rsID alias");
    links.set(old, current);
  }
  const resolved: Record<string, string> = {};
  for (const old of links.keys()) {
    let current = old;
    const seen = new Set();
    while (links.has(current)) {
      if (seen.has(current)) throw new Error("Cycle in rsID aliases");
      seen.add(current);
      current = links.get(current)!;
    }
    if (known.has(old)) throw new Error(`Alias ${old} is still a direct ID in these inputs`);
    if (known.has(current)) resolved[old] = current;
  }
  return resolved;
}

async function createIndex({ paths, build }: ResolvedOptions & { build: string }) {
  requireFiles(paths.catalog(build), paths.markers(build));
  const catalogBytes = fs.readFileSync(paths.catalog(build));
  const markerBytes = fs.readFileSync(paths.markers(build));
  const markers = JSON.parse(markerBytes.toString("utf8")) as MarkerData;
  if (markers.build !== build || !Array.isArray(markers.markers))
    throw new Error("Consumer index marker build mismatch");
  const catalog: Record<string, string[]> = {},
    markerIndex: Record<string, string[]> = {},
    releases = new Set();
  let rows = 0;
  for await (const line of readLines(paths.catalog(build))) {
    if (rows++ === 0) {
      if (line !== CATALOG_HEADER) throw new Error("Consumer index catalogue schema mismatch");
      continue;
    }
    if (!line) continue;
    const fields = validateCatalogRow(line);
    if (fields[19]) releases.add(fields[19]);
    if (!supportedChromosome(fields[0]!) || !singleBase(fields[2]!, fields[3]!)) continue;
    const ids = fields[16];
    if (!ids || ids === ".") continue;
    for (const id of ids.split(/[|,;]/)) add(catalog, id, fields.slice(0, 4).join(":"));
  }
  if (rows < 2) throw new Error("Cannot index an empty catalogue");
  for (const marker of markers.markers) {
    if (supportedChromosome(marker.chrom) && singleBase(marker.ref, marker.alt))
      add(markerIndex, marker.rs, `${marker.chrom}:${marker.pos}:${marker.ref}:${marker.alt}`);
  }
  const aliasFile = path.join(paths.data, "consumer-rsid-aliases.json");
  const aliasBytes = fs.existsSync(aliasFile) ? fs.readFileSync(aliasFile) : null;
  const aliasInput = aliasBytes ? JSON.parse(aliasBytes.toString("utf8")) : null;
  return {
    schema: 1,
    build,
    sources: {
      catalog: { sha256: digest(catalogBytes), releases: [...releases].sort() },
      markers: { sha256: digest(markerBytes), dataset: markers.dataset },
      aliases: aliasInput
        ? { sha256: digest(aliasBytes!), source: aliasInput.source, release: aliasInput.release }
        : null,
    },
    catalog,
    markers: markerIndex,
    aliases: resolveAliases(
      aliasInput,
      new Set([...Object.keys(catalog), ...Object.keys(markerIndex)]),
    ),
  };
}

export async function buildConsumerIndex(options: ResolvedOptions & { build: string }) {
  const index = await createIndex(options);
  const file = indexPath(options.paths, options.build);
  writeAtomic(file, gzipSync(JSON.stringify(index), { level: 9 }));
  log(
    `${options.build}: ${Object.keys(index.catalog).length.toLocaleString()} catalogue rsIDs, ${Object.keys(index.markers).length} markers, ${Object.keys(index.aliases).length} verified aliases → ${file}`,
  );
  return index;
}

export async function checkConsumerIndex(options: ResolvedOptions & { build: string }) {
  const file = indexPath(options.paths, options.build);
  requireFiles(file);
  const actual = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
  const expected = await createIndex(options);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${options.build}: consumer rsID index is stale or invalid; run data:build`);
  log(`${options.build}: consumer rsID index and source hashes validated`);
}
