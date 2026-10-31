import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bgzfBytes } from "../../../tests/helpers/vcf.ts";
import { blockLength } from "../io/bgzf.ts";
import { loadCatalogue, streamCatalogueRows } from "./catalogue-stream.ts";
import type { CatalogueMetadata } from "./types.ts";
import type { Fetcher } from "../io/types.ts";
import { AppError } from "../app-error.ts";

const header = "#chrom\tpos\tref\talt\tsig\tstars\tgene";
const row = (position: number) => `1\t${position}\tA\tG\tP\t1\tGène`;
function fixture(count = 3, blockSize = 37) {
  const rows = Array.from({ length: count }, (_, i) => row(i + 1));
  // Includes CRLF and a final unterminated row, with UTF-8 characters crossing tiny blocks.
  const bytes = bgzfBytes([header, ...rows].join("\r\n"), blockSize);
  const metadata: CatalogueMetadata = {
    schema: 1,
    build: "GRCh38",
    source: { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
    chromosomes: ["1"],
    n: rows.length,
    header,
    byClass: { P: rows.length },
    byStars: { "1": rows.length },
    sample: rows.slice(0, 6),
    examples: rows.slice(0, 3),
  };
  return { rows, bytes, metadata };
}
function chunks(bytes: Uint8Array, size: number) {
  return Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) =>
    bytes.subarray(i * size, (i + 1) * size),
  );
}
function body(parts: Uint8Array[], onPull = () => {}, onCancel = () => {}) {
  let index = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        onPull();
        if (index < parts.length) controller.enqueue(parts[index++]!);
        else controller.close();
      },
      cancel: onCancel,
    },
    { highWaterMark: 0 },
  );
}

// Never use response.arrayBuffer for the catalogue; the stream is the only available reader.
function streamedResponse(parts: Uint8Array[], init?: ResponseInit) {
  const response = new Response(body(parts), init);
  response.arrayBuffer = () => Promise.reject(new Error("Catalogue body must stay streamed"));
  return response;
}

test("catalogue streaming reconstructs rows across arbitrary network, block and UTF-8 boundaries", async () => {
  const { rows, bytes, metadata } = fixture(3, 1);
  const requests: { input: string; init: RequestInit | undefined }[] = [];
  const fetcher: Fetcher = async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input).endsWith("catalog.meta.json")) return Response.json(metadata);
    return streamedResponse(chunks(bytes, 7), {
      headers: { "Content-Length": String(bytes.length) },
    });
  };
  const catalogue = await loadCatalogue("GRCh38", undefined, undefined, fetcher);
  assert.equal(requests.length, 1, "loading summary never downloads the catalogue");
  const progress: number[] = [];
  assert.deepEqual(
    await Array.fromAsync(catalogue.rows(undefined, (value) => progress.push(value))),
    rows,
  );
  assert.equal(requests.length, 2);
  assert.equal(new Headers(requests[1]!.init?.headers).has("Range"), false);
  assert.equal(requests[1]!.input, `/ref/GRCh38/catalog.tsv.gz?v=${metadata.source.sha256}`);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => value >= (progress[index - 1] ?? 0) && value <= 1));
});

test("catalogue rows apply backpressure and cancel an unfinished download on early return", async () => {
  const { bytes, metadata } = fixture(2_000, 200);
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const length = blockLength(bytes, offset);
    parts.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  let pulls = 0;
  let cancelled = false;
  const fetcher: Fetcher = async () =>
    new Response(
      body(
        parts,
        () => pulls++,
        () => {
          cancelled = true;
        },
      ),
    );
  const reader = streamCatalogueRows(metadata, undefined, undefined, fetcher);
  assert.equal((await reader.next()).value, row(1));
  assert.ok(pulls <= 2, `Only the needed compressed chunks should be pulled, got ${pulls}`);
  await reader.return(undefined);
  assert.equal(cancelled, true);
  assert.ok(pulls < parts.length);
});

test("aborting while a catalogue body read is pending cancels it promptly", async () => {
  const { bytes, metadata } = fixture(10, 80);
  const firstLength = blockLength(bytes);
  let first = true;
  let cancelled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (first) {
            first = false;
            controller.enqueue(bytes.subarray(0, firstLength));
          }
          // All later reads deliberately wait for cancellation.
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
  );
  const controller = new AbortController();
  const reader = streamCatalogueRows(metadata, controller.signal, undefined, async () => response);
  assert.equal((await reader.next()).value, row(1));
  const pending = Array.fromAsync(reader);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("catalogue integrity failures reject final results, including digest, count, truncation and CRC", async () => {
  const { bytes, metadata } = fixture();
  const corrupt = Buffer.from(bytes);
  corrupt[blockLength(corrupt) - 8]! ^= 1;
  for (const [description, candidate, payload] of [
    ["digest", { ...metadata, source: { ...metadata.source, sha256: "0".repeat(64) } }, bytes],
    ["count", { ...metadata, n: 4 }, bytes],
    ["truncation", metadata, bytes.subarray(0, -1)],
    ["CRC", metadata, corrupt],
  ] as const) {
    await assert.rejects(
      Array.fromAsync(
        streamCatalogueRows(candidate, undefined, undefined, async () =>
          streamedResponse(chunks(payload, 13)),
        ),
      ),
      (error: unknown) => {
        assert.ok(error instanceof AppError, description);
        assert.ok(["REFERENCE_INTEGRITY_FAILED", "REFERENCE_DECODE_FAILED"].includes(error.code));
        assert.equal(error.details.resource, "catalogue-entries");
        assert.equal(error.details.publicFile, "/ref/GRCh38/catalog.tsv.gz");
        return true;
      },
    );
  }
});

test("metadata/body disagreement and unordered public records are rejected", async () => {
  const { bytes, metadata } = fixture();
  for (const init of [
    { status: 206 },
    { headers: { "Content-Encoding": "gzip" } },
    { headers: { "Content-Length": "1" } },
  ])
    await assert.rejects(
      Array.fromAsync(
        streamCatalogueRows(metadata, undefined, undefined, async () =>
          streamedResponse([bytes], init),
        ),
      ),
      { code: "REFERENCE_INTEGRITY_FAILED" },
    );
  const unsorted = bgzfBytes([header, row(2), row(1), row(3)].join("\n"));
  await assert.rejects(
    Array.fromAsync(
      streamCatalogueRows(
        {
          ...metadata,
          source: {
            size: unsorted.length,
            sha256: createHash("sha256").update(unsorted).digest("hex"),
          },
        },
        undefined,
        undefined,
        async () => streamedResponse([unsorted]),
      ),
    ),
    { code: "REFERENCE_INTEGRITY_FAILED", message: /order/ },
  );
});

test("body network failures retain only a public resource path and never an arbitrary exception message", async () => {
  const { metadata } = fixture();
  const response = new Response(
    new ReadableStream({
      pull() {
        throw new Error("PRIVATE_REQUEST_DETAILS");
      },
    }),
  );
  await assert.rejects(
    Array.fromAsync(streamCatalogueRows(metadata, undefined, undefined, async () => response)),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "NETWORK_FAILED");
      assert.equal(error.details.publicFile, "/ref/GRCh38/catalog.tsv.gz");
      assert.ok(!JSON.stringify(error).includes("PRIVATE_REQUEST_DETAILS"));
      return true;
    },
  );
});

test("invalid catalogue metadata fails before a catalogue download", async () => {
  const { metadata } = fixture();
  let requests = 0;
  for (const candidate of [
    { ...metadata, chromosomes: ["1", "1"] },
    { ...metadata, n: -1 },
    { ...metadata, byClass: { P: 2 } },
    { ...metadata, source: { ...metadata.source, sha256: "bad" } },
    { ...metadata, build: "GRCh37" },
  ]) {
    const before = requests;
    await assert.rejects(
      loadCatalogue("GRCh38", undefined, undefined, async () => {
        requests++;
        return Response.json(candidate);
      }),
      (error: unknown) => error instanceof AppError,
    );
    assert.equal(requests, before + 1);
  }
});
