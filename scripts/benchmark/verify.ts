import { openAsBlob, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createStaticServer } from "../lib/static-server.ts";
import { expectedMatches } from "./reference.ts";
import { findMatches } from "../../src/experiences/vcf/engine/matching.ts";
import { loadCatalogue } from "../../src/lib/catalogues/catalogue-stream.ts";
import type { Fetcher } from "../../src/lib/io/types.ts";
import type { VcfMatch } from "../../src/experiences/vcf/types.ts";

export async function fileSha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

// Object property order is irrelevant; result and nested-array order must be preserved.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

export function checkResults(expected: VcfMatch[], actual: VcfMatch[]) {
  const digest = (value: VcfMatch[]) =>
    createHash("sha256")
      .update(JSON.stringify(canonical(value)))
      .digest("hex");
  return {
    identical: isDeepStrictEqual(expected, actual),
    expectedCount: expected.length,
    actualCount: actual.length,
    expectedSha256: digest(expected),
    actualSha256: digest(actual),
  };
}

/** Verify the production matcher against a simple, local reference join. No performance metrics. */
export async function verifyMatching(options: {
  publicDirectory: string;
  sampleFile: string;
  expectedSampleSha256?: string;
  build: string;
  onStatus?: (message: string) => void;
}) {
  if (options.build !== "GRCh37" && options.build !== "GRCh38")
    throw new Error("A supported reference build is required");
  const sampleSha256 = await fileSha256(options.sampleFile);
  if (options.expectedSampleSha256 && sampleSha256 !== options.expectedSampleSha256)
    throw new Error("Public sample checksum mismatch");
  const catalogueFile = path.join(options.publicDirectory, "ref", options.build, "catalog.tsv.gz");
  const metadataFile = path.join(
    options.publicDirectory,
    "ref",
    options.build,
    "catalog.meta.json",
  );
  const catalogueSha256 = await fileSha256(catalogueFile);
  const metadataSha256 = await fileSha256(metadataFile);
  const blob = await openAsBlob(options.sampleFile);
  const source = {
    size: blob.size,
    async slice(start: number, end: number, signal?: AbortSignal) {
      signal?.throwIfAborted();
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
  options.onStatus?.("Computing expected results from the local catalogue");
  const expected = await expectedMatches(catalogueFile, source);
  const server = createStaticServer(options.publicDirectory);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const localFetch: Fetcher = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), origin);
      if (url.origin !== origin) throw new Error("Correctness checks must use the local server");
      return fetch(url, init);
    };
    options.onStatus?.("Verifying every production result field and its ordering");
    const catalogue = await loadCatalogue(options.build, undefined, undefined, localFetch);
    if (catalogue.source.sha256 !== catalogueSha256)
      throw new Error("Catalogue and metadata identify different files");
    const actual = await findMatches(source, catalogue);
    return {
      build: options.build,
      sample: { sha256: sampleSha256 },
      catalogue: { sha256: catalogueSha256, records: catalogue.n },
      metadata: { sha256: metadataSha256 },
      results: checkResults(expected, actual),
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
