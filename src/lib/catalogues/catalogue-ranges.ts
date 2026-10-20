import type { BlockLocator, CatalogueIndex, RowLocator } from "./types.ts";
import type { Fetcher, Status } from "../io/types.ts";
export type CatalogueMap = Map<string, string> | RangeCatalogue;
import { gunzipSync } from "fflate";
import { readByteRange } from "../io/http-range.ts";

const hex = /^[a-f0-9]{64}$/;
const integer = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
// ClinVar also contains named reference contigs (for example NW_003315950.2).
const keyPattern = /^[A-Za-z0-9_.-]+:[1-9]\d*:[ACGTN]{1,50}:[ACGTN]{1,50}$/;
const sha256 = async (bytes: BufferSource) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** A local identity map whose annotation rows are fetched only after matching. */
export class RangeCatalogue extends Map<string, RowLocator> {
  declare readonly blocks: BlockLocator[];
  declare readonly source: CatalogueIndex["source"];
  declare readonly url: string;
  declare readonly fetcher: Fetcher;
  declare readonly rows: Map<string, string>;
  declare bytesRead: number;
  constructor(index: CatalogueIndex, url: string, fetcher: Fetcher = fetch) {
    super();
    if (
      index.schema !== 1 ||
      !integer(index.source?.size) ||
      !hex.test(index.source?.sha256) ||
      !Array.isArray(index.blocks) ||
      !Array.isArray(index.records) ||
      index.records.length !== index.n
    )
      throw new Error("Invalid catalogue byte-range index");
    let next = 0;
    for (const [offset, length, decoded, hash] of index.blocks) {
      if (
        offset !== next ||
        !integer(length) ||
        length < 26 ||
        length > 65536 ||
        !integer(decoded) ||
        decoded > 65536 ||
        !hex.test(hash)
      )
        throw new Error("Invalid catalogue block locator");
      next += length;
    }
    if (next !== index.source.size) throw new Error("Catalogue size does not match its index");
    for (const locator of index.records) {
      const [key, block, offset, length] = locator;
      if (
        !keyPattern.test(key) ||
        !integer(block) ||
        !integer(offset) ||
        !integer(length) ||
        !length ||
        !index.blocks[block] ||
        offset >= index.blocks[block][2]
      )
        throw new Error("Invalid catalogue row locator");
      this.set(key, locator);
    }
    this.blocks = index.blocks;
    this.source = index.source;
    this.url = url;
    this.fetcher = fetcher;
    this.rows = new Map();
    this.bytesRead = 0;
  }

  async readEntries(keys: Iterable<string>, signal?: AbortSignal, onStatus?: Status) {
    signal?.throwIfAborted();
    const requested = [...new Set(keys)];
    const missing = requested.filter((key) => !this.rows.has(key));
    const required = new Set<number>();
    for (const key of missing) {
      const locator = this.get(key)!;
      if (!locator) throw new Error("A matched key is absent from the catalogue index");
      let [, block, offset, remaining] = locator;
      while (remaining > 0) {
        const available = (this.blocks[block]?.[2] || 0) - offset;
        if (available <= 0) throw new Error("Catalogue row extends beyond its indexed blocks");
        required.add(block);
        remaining -= Math.min(remaining, available);
        offset = 0;
        block++;
      }
    }
    // Adjacent requested blocks share an HTTP request; unrelated blocks stay on the host.
    const ranges: number[][] = [];
    for (const block of [...required].sort((a, b) => a - b)) {
      const last = ranges.at(-1);
      if (last && last.at(-1) === block - 1) last.push(block);
      else ranges.push([block]);
    }
    if (ranges.length) onStatus?.("Loading matched catalogue entries…");
    const decoded = new Map<number, Uint8Array>();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, ranges.length) }, async () => {
        while (cursor < ranges.length) {
          const blocks = ranges[cursor++]!;
          const start = this.blocks[blocks[0]!]![0];
          const tail = this.blocks[blocks.at(-1)!]!;
          const bytes = await readByteRange(this.url, start, tail[0] + tail[1], {
            size: this.source.size,
            signal,
            fetcher: this.fetcher,
          });
          this.bytesRead += bytes.length;
          for (const block of blocks) {
            const [offset, length, size, hash] = this.blocks[block]!;
            const compressed = bytes.subarray(offset - start, offset - start + length);
            if ((await sha256(compressed)) !== hash)
              throw new Error(
                "Catalogue block does not match its index. Deploy the reference files together.",
              );
            const data = gunzipSync(compressed);
            if (data.length !== size) throw new Error("Invalid decoded catalogue block size");
            decoded.set(block, data);
          }
        }
      }),
    );
    signal?.throwIfAborted();
    for (const key of missing) {
      let [, block, offset, remaining] = this.get(key)!;
      const bytes = new Uint8Array(remaining);
      let written = 0;
      while (remaining > 0) {
        const data = decoded.get(block++)!.subarray(offset, offset + remaining);
        bytes.set(data, written);
        written += data.length;
        remaining -= data.length;
        offset = 0;
      }
      const line = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r$/, "");
      if (line.split("\t", 4).join(":") !== key)
        throw new Error("Catalogue row does not match its indexed allele");
      this.rows.set(key, line);
    }
    return new Map(requested.map((key) => [key, this.rows.get(key)!]));
  }
}

export async function loadRangeCatalogue(
  build: string,
  signal?: AbortSignal,
  onStatus?: Status,
  fetcher: Fetcher = fetch,
) {
  signal?.throwIfAborted();
  onStatus?.(`Loading the ${build} catalogue index…`);
  const started = performance.now();
  const response = await fetcher(`/ref/${build}/catalog.index.json.gz`, {
    signal: signal ?? null,
  });
  if (!response.ok)
    throw new Error(`Catalogue index unavailable (${response.status}). Run data:ranges.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const json = bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes;
  const index: CatalogueIndex = JSON.parse(new TextDecoder().decode(json));
  if (index.build !== build) throw new Error("Catalogue index reference-build mismatch");
  signal?.throwIfAborted();
  const map = new RangeCatalogue(
    index,
    `/ref/${build}/catalog.tsv.gz?v=${index.source.sha256}`,
    fetcher,
  );
  return {
    build,
    map,
    header: index.header,
    n: index.n,
    byClass: index.byClass,
    byStars: index.byStars,
    sample: index.sample,
    source: index.source,
    bytes: bytes.length,
    seconds: (performance.now() - started) / 1000,
  };
}

// Plain maps keep synthetic fixtures and local catalogue tools straightforward.
export async function readCatalogueEntries(
  map: CatalogueMap,
  keys: string[],
  signal?: AbortSignal,
  onStatus?: Status,
) {
  signal?.throwIfAborted();
  return "readEntries" in map
    ? map.readEntries(keys, signal, onStatus)
    : new Map(keys.map((key) => [key, map.get(key)!]));
}
