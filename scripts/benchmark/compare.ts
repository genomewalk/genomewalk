import { openAsBlob, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AddressInfo } from "node:net";
import { createStaticServer } from "../lib/static-server.ts";
import { indexCatalogue } from "../../src/lib/catalogues/reference-catalogue.ts";
import { loadRangeCatalogue } from "../../src/lib/catalogues/catalogue-ranges.ts";
import { findMatches } from "../../src/experiences/vcf/engine/matching.ts";
import type { Fetcher } from "../../src/lib/io/types.ts";

export async function fileSha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export interface Transfer {
  path: string;
  range: string | null;
  status: number;
  bytes: number;
  sha256: string;
}

/** Count actual HTTP body bytes, excluding headers and the local sample file. */
function measuredFetch(origin: string, transfers: Transfer[]): Fetcher {
  return async (input, init) => {
    const url = new URL(String(input), origin);
    if (url.origin !== origin) throw new Error("Benchmark requests must stay on the local server");
    const response = await fetch(url, { ...init, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.pathname}`);
    if (response.headers.has("content-encoding"))
      throw new Error("Benchmark requires unchanged compressed file bytes");
    const bytes = new Uint8Array(await response.arrayBuffer());
    transfers.push({
      path: url.pathname,
      range: new Headers(init?.headers).get("range"),
      status: response.status,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    return new Response(bytes, { status: response.status, headers: response.headers });
  };
}

export async function compareCatalogues(options: {
  publicDirectory: string;
  sampleFile: string;
  expectedSampleSha256: string;
  build: string;
  onStatus?: (message: string) => void;
}) {
  const sampleSha256 = await fileSha256(options.sampleFile);
  if (sampleSha256 !== options.expectedSampleSha256)
    throw new Error("Public sample checksum mismatch");
  const blob = await openAsBlob(options.sampleFile);
  const source = {
    size: blob.size,
    async slice(start: number, end: number, signal?: AbortSignal) {
      signal?.throwIfAborted();
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
  const server = createStaticServer(options.publicDirectory);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fullTransfers: Transfer[] = [];
    const selectiveTransfers: Transfer[] = [];
    options.onStatus?.("Full catalogue: downloading and matching the public sample");
    const fullResponse = await measuredFetch(
      origin,
      fullTransfers,
    )(`/ref/${options.build}/catalog.tsv.gz`);
    const full = await indexCatalogue(new Uint8Array(await fullResponse.arrayBuffer()));
    const fullResults = await findMatches(source, full.map);
    full.map.clear();

    options.onStatus?.("Index and required blocks: independently matching the same sample");
    const selective = await loadRangeCatalogue(
      options.build,
      undefined,
      undefined,
      measuredFetch(origin, selectiveTransfers),
    );
    const selectiveResults = await findMatches(source, selective.map);
    if (
      selective.source.sha256 !== fullTransfers[0]!.sha256 ||
      selective.source.size !== fullTransfers[0]!.bytes
    )
      throw new Error("Full catalogue and index identify different files");
    const fullBytes = fullTransfers.reduce((sum, request) => sum + request.bytes, 0);
    const indexBytes = selectiveTransfers
      .filter((r) => r.range === null)
      .reduce((sum, request) => sum + request.bytes, 0);
    const blockRequests = selectiveTransfers.filter((r) => r.range !== null);
    const blockBytes = blockRequests.reduce((sum, request) => sum + request.bytes, 0);
    const resultHash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    return {
      build: options.build,
      sample: { bytes: blob.size, sha256: sampleSha256 },
      catalogue: { ...selective.source, records: selective.n },
      index: { bytes: indexBytes, sha256: selectiveTransfers[0]!.sha256 },
      results: {
        identical: isDeepStrictEqual(fullResults, selectiveResults),
        fullCount: fullResults.length,
        selectiveCount: selectiveResults.length,
        fullSha256: resultHash(fullResults),
        selectiveSha256: resultHash(selectiveResults),
      },
      downloads: {
        fullBytes,
        indexBytes,
        blockBytes,
        selectiveBytes: indexBytes + blockBytes,
        rangeRequests: blockRequests.length,
        savingsPercent: 100 * (1 - (indexBytes + blockBytes) / fullBytes),
      },
      requests: { full: fullTransfers, selective: selectiveTransfers },
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
