import type { CatalogueIndex } from "../../src/lib/catalogues/types.ts";
import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { streamBlocks } from "./io/bgzf.ts";
import { writeAtomic } from "./io/atomic.ts";
import { CATALOG_HEADER } from "./clinvar.ts";
import { log } from "./log.ts";
import type { BinaryLike } from "crypto";

const sha = (bytes: BinaryLike) => createHash("sha256").update(bytes).digest("hex");

/** Exact keys and byte locators; annotations remain in the unchanged BGZF file. */
export async function catalogueRangeIndex(bytes: NonSharedBuffer, build: string) {
  const index: CatalogueIndex = {
    schema: 1,
    build,
    source: { size: bytes.length, sha256: sha(bytes) },
    header: "",
    n: 0,
    byClass: {},
    byStars: {},
    sample: [],
    blocks: [],
    records: [],
  };
  let carry = Buffer.alloc(0),
    firstBlock = 0,
    firstOffset = 0;
  function record(raw: Uint8Array) {
    const line = new TextDecoder("utf-8", { fatal: true }).decode(raw).replace(/\r$/, "");
    if (!line) return;
    if (line.startsWith("#")) {
      if (line !== CATALOG_HEADER) throw new Error("Unrecognized catalogue header");
      index.header = line;
      return;
    }
    const [chrom, pos, ref, alt, classification, stars] = line.split("\t", 6);
    index.records.push([`${chrom}:${pos}:${ref}:${alt}`, firstBlock, firstOffset, raw.length]);
    index.byClass[classification!] = (index.byClass[classification!] || 0) + 1;
    index.byStars[stars!] = (index.byStars[stars!] || 0) + 1;
    if (index.sample.length < 6) index.sample.push(line);
    index.n++;
  }
  const source = {
    size: bytes.length,
    slice: async (start: number | undefined, end: number | undefined) => bytes.subarray(start, end),
  };
  for await (const { data, offset, blockLen } of streamBlocks(source)) {
    const block = index.blocks.length;
    index.blocks.push([
      offset,
      blockLen,
      data.length,
      sha(bytes.subarray(offset, offset + blockLen)),
    ]);
    let start = 0;
    for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, start)) {
      if (!carry.length) {
        firstBlock = block;
        firstOffset = start;
      }
      record(Buffer.concat([carry, data.subarray(start, end)]));
      carry = Buffer.alloc(0);
      start = end + 1;
    }
    if (start < data.length) {
      if (!carry.length) {
        firstBlock = block;
        firstOffset = start;
      }
      carry = Buffer.concat([carry, data.subarray(start)]);
    }
  }
  if (carry.length) record(carry);
  if (!index.header || !index.n) throw new Error("Cannot index an empty catalogue");
  return index;
}

export async function buildCatalogRanges({ paths, build }: ResolvedOptions & { build: string }) {
  const index = await catalogueRangeIndex(fs.readFileSync(paths.catalog(build)), build);
  writeAtomic(paths.catalogIndex(build), gzipSync(JSON.stringify(index), { level: 9 }));
  log(`${build}: ${index.n.toLocaleString()} byte-range locators → ${paths.catalogIndex(build)}`);
  return index;
}

export async function checkCatalogRanges({ paths, build }: ResolvedOptions & { build: string }) {
  const actual = JSON.parse(
    gunzipSync(fs.readFileSync(paths.catalogIndex(build))).toString("utf8"),
  );
  const expected = await catalogueRangeIndex(fs.readFileSync(paths.catalog(build)), build);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${build}: catalogue byte-range index is stale or invalid. Run data:ranges.`);
  log(`${build}: byte-range locators and compressed-block hashes validated`);
}
