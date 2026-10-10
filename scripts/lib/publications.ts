import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { ResolvedOptions } from "./types.ts";
import { BUILDS } from "./config.ts";
import { readLines } from "./io/lines.ts";
import { readCitationIndex } from "./reference/clinvar-citations.ts";
import { writeAtomic } from "./io/atomic.ts";
import { CATALOG_HEADER, CATALOG_COLUMNS, parseClinvar } from "./clinvar.ts";
import { log } from "./log.ts";
import { PUBMED_SUMMARIES, publicationFetcher } from "./reference/publication-metadata.ts";
import {
  PUBLICATION_SHARDS,
  publicationLabels,
  publicationManifest,
  validPmid,
} from "../../src/lib/catalogues/publication-format.ts";
import type {
  PublicationLabels,
  PublicationManifest,
} from "../../src/lib/catalogues/publication-format.ts";

interface CachedPublication {
  label: string | null;
  fetchedAt: string;
}
interface PublicationCache {
  schema: 1;
  source: string;
  entries: Record<string, CachedPublication>;
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const cachePath = (options: ResolvedOptions) =>
  path.join(options.paths.data, "publications.json.gz");
const outputPath = (options: ResolvedOptions) => path.join(options.paths.output, "publications");

function readCache(options: ResolvedOptions): PublicationCache {
  if (!fs.existsSync(cachePath(options)))
    return { schema: 1, source: PUBMED_SUMMARIES, entries: {} };
  const cache: PublicationCache = JSON.parse(
    gunzipSync(fs.readFileSync(cachePath(options))).toString(),
  );
  if (
    cache.schema !== 1 ||
    cache.source !== PUBMED_SUMMARIES ||
    !cache.entries ||
    !Object.entries(cache.entries).every(
      ([id, item]) =>
        validPmid(id) &&
        item &&
        typeof item.fetchedAt === "string" &&
        Number.isFinite(Date.parse(item.fetchedAt)) &&
        (item.label === null ||
          (typeof item.label === "string" && !!item.label.trim() && item.label.length <= 500)),
    )
  )
    throw new Error("Invalid publication cache; restore it or remove it and run data:publications");
  return cache;
}

/** Include both existing catalogues even with --only: these labels are shared across builds. */
export async function cataloguePmids(options: ResolvedOptions) {
  const ids = new Set<string>();
  let found = false;
  for (const build of BUILDS) {
    const file = options.paths.catalog(build);
    if (!fs.existsSync(file)) {
      if (!options.only || options.only === build)
        throw new Error(`Missing ${file}; run data:catalog first`);
      continue;
    }
    found = true;
    for await (const line of readLines(file)) {
      if (line.startsWith("#")) {
        if (line !== CATALOG_HEADER) throw new Error("Unrecognized catalogue header");
        continue;
      }
      for (const id of (line.split("\t")[CATALOG_COLUMNS.indexOf("pmids")] || "").split(","))
        if (validPmid(id)) ids.add(id);
    }
  }
  if (!found) throw new Error("No catalogues to annotate");
  return [...ids].sort((a, b) => +a - +b);
}

/** Verify the incoming ClinVar release before a network-free rebuild writes any output. */
export async function requireCachedPublications(options: ResolvedOptions) {
  const variations = new Set<string>();
  for (const build of options.only ? [options.only] : BUILDS)
    for await (const line of readLines(options.paths.clinvar(build))) {
      const record = parseClinvar(line);
      if (record) variations.add(record.variationId);
    }
  const ids = new Set<string>();
  const citations = await readCitationIndex(options.paths.citations);
  for (const variation of variations)
    for (const id of citations.pmids.get(variation) || []) ids.add(id);
  if (options.only) {
    for (const build of BUILDS.filter((build) => build !== options.only)) {
      const file = options.paths.catalog(build);
      if (!fs.existsSync(file)) continue;
      for await (const line of readLines(file))
        for (const id of (line.split("\t")[18] || "").split(",")) if (validPmid(id)) ids.add(id);
    }
  }
  const cache = readCache(options);
  const missing = [...ids].filter((id) => !cache.entries[id]);
  if (missing.length)
    throw new Error(
      `Offline publication cache lacks ${missing.length} PMIDs. Run data:build with network access first. No build stages ran.`,
    );
}

export async function buildPublications(
  options: ResolvedOptions,
  { fetcher = fetch, batchSize = 500 } = {},
) {
  const ids = await cataloguePmids(options),
    cache = readCache(options);
  const missing = ids.filter((id) => options.fresh || !cache.entries[id]);
  if (options.offline && missing.length)
    throw new Error(
      `Publication cache lacks ${missing.length} PMIDs. Run data:publications without --offline first.`,
    );
  const fetchBatch = publicationFetcher(fetcher);
  log(
    `Publications: ${ids.length.toLocaleString()} unique PMIDs; ${missing.length.toLocaleString()} need metadata`,
  );
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const labels = await fetchBatch(batch),
      fetchedAt = new Date().toISOString();
    for (const [id, label] of Object.entries(labels)) cache.entries[id] = { label, fetchedAt };
    // Checkpoint each batch so an interrupted first download can resume.
    writeAtomic(cachePath(options), gzipSync(JSON.stringify(cache), { level: 1 }));
    log(
      `Publication metadata ${Math.min(start + batch.length, missing.length).toLocaleString()}/${missing.length.toLocaleString()}`,
    );
  }
  const manifest: PublicationManifest = { schema: 1, count: ids.length, labeled: 0, shards: {} };
  const shards = Array.from({ length: PUBLICATION_SHARDS }, (): PublicationLabels => ({}));
  for (const id of ids) {
    const label = cache.entries[id]!.label;
    shards[Number(id) % PUBLICATION_SHARDS]![id] = label;
    if (label) manifest.labeled++;
  }
  for (const [i, labels] of shards.entries()) {
    const key = i.toString(16).padStart(2, "0");
    const bytes = gzipSync(JSON.stringify(labels), { level: 9 }),
      sha = hash(bytes);
    manifest.shards[key] = sha;
    writeAtomic(path.join(outputPath(options), `${key}.${sha}.json.gz`), bytes);
  }
  // Publish last. Content-addressed shards preserve any previous valid release.
  writeAtomic(path.join(outputPath(options), "index.json"), JSON.stringify(manifest));
  log(
    `Publications: ${manifest.labeled.toLocaleString()} labels; ${manifest.count - manifest.labeled} PMID fallbacks; ${PUBLICATION_SHARDS} static shards`,
  );
  return manifest;
}

export async function checkPublications(options: ResolvedOptions) {
  const manifest = publicationManifest(
    JSON.parse(fs.readFileSync(path.join(outputPath(options), "index.json"), "utf8")),
  );
  const expected = new Set(await cataloguePmids(options));
  const expectedCount = expected.size;
  let count = 0,
    labeled = 0;
  for (const [key, sha] of Object.entries(manifest.shards)) {
    const bytes = fs.readFileSync(path.join(outputPath(options), `${key}.${sha}.json.gz`));
    if (hash(bytes) !== sha) throw new Error("Publication shard checksum mismatch");
    const labels = publicationLabels(JSON.parse(gunzipSync(bytes).toString()), key);
    for (const [id, label] of Object.entries(labels)) {
      count++;
      if (label) labeled++;
      expected.delete(id);
    }
  }
  if (
    expected.size ||
    count !== expectedCount ||
    count !== manifest.count ||
    labeled !== manifest.labeled
  )
    throw new Error("Publication metadata is incomplete or stale; run data:publications");
  log(
    `Publications: ${count.toLocaleString()} PMIDs covered, ${labeled.toLocaleString()} labels validated`,
  );
}
